"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// prettier-ignore
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Clock, MapPin, Target, Users, Zap, AlertTriangle, Play, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { moveToNode, playCard, endRun } from "@/lib/game-play-actions";
import MapSvg from "./GameMap.svg";

interface GamePlayContentProps {
  game: any;
  user: { id: string; email?: string };
}

export default function GamePlayContent({ game, user }: GamePlayContentProps) {
  const map = game.maps;
  const [gameState, setGameState] = useState(game.game_state?.[0] || null);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [showEndRunDialog, setShowEndRunDialog] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [runTime, setRunTime] = useState(0);
  const router = useRouter();

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastDistance = useRef<number | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  // Refs for SVG and viewport
  // Measure sizes after mount
  function updateContainerSizes(): void {
    if (!viewportRef.current || !svgRef.current) return;
    const vpRect = viewportRef.current.getBoundingClientRect();
    const svgRect = svgRef.current.getBoundingClientRect();
    setViewportSize({ width: vpRect.width, height: vpRect.height });
    setSvgSize({ width: svgRect.width, height: svgRect.height });
  }

  useEffect(updateContainerSizes, [scale, offset]);

  // ******************************************************************************
  // FIX: Clamping for the right and the bottom will begin to fail when you zoom in
  // ******************************************************************************

  // Helper to clamp a value between min and max
  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  // Clamp pan based on SVG and viewport size
  function clampOffset(value: number, svgSize: number, viewportSize: number, scale: number) {
    const minOffset = Math.min(viewportSize - svgSize * scale, 0);
    const maxOffset = 0;
    return clamp(value, minOffset, maxOffset);
  }

  // ******************************************************************************
  // FIX: Zooming in zooms with the top left as the origin, rather than around the
  //      point that the user is hovering over
  // ******************************************************************************

  // Apply zoom dynamically
  const applyZoom = (newScale: number, originX: number, originY: number) => {
    console.log("APPLY ZOOM");
    const clampedScale = clamp(newScale, 0.25, 4);

    setOffset((prev) => ({
      x: clampOffset(
        originX - (originX - prev.x) * (clampedScale / scale),
        svgSize.width,
        viewportSize.width,
        clampedScale,
      ),
      y: clampOffset(
        originY - (originY - prev.y) * (clampedScale / scale),
        svgSize.height,
        viewportSize.height,
        clampedScale,
      ),
    }));

    setScale(clampedScale);
  };

  // Panning
  const handlePointerDown = (e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!lastPointer.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;

    setOffset((prev) => ({
      x: clampOffset(prev.x + dx, svgSize.width, viewportSize.width, scale),
      y: clampOffset(prev.y + dy, svgSize.height, viewportSize.height, scale),
    }));

    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    lastPointer.current = null;
  };

  // Convert client coordinates to local SVG coordinates
  const getLocalPosition = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  };

  // Touch pinch zoom
  const handleTouchMove = (e: React.TouchEvent) => {
    // console.log("TOUCH MOVE");
    if (e.touches.length === 2) {
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      const local = getLocalPosition(centerX, centerY);

      if (lastDistance.current) {
        const delta = distance / lastDistance.current;
        const newScale = clamp(scale * delta, 0.25, 4);
        applyZoom(newScale, local.x, local.y);
      }
      lastDistance.current = distance;
    }
  };

  const handleTouchEnd = () => {
    // console.log("TOUCH END");
    lastDistance.current = null;
  };

  // Wheel zoom (desktop)
  const handleWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // zoom only with ctrl/meta
    e.preventDefault();
    e.stopPropagation();
    const localX = e.clientX - viewportRef.current!.getBoundingClientRect().left - offset.x;
    const localY = e.clientY - viewportRef.current!.getBoundingClientRect().top - offset.y;
    const zoomFactor = 1 - e.deltaY * 0.002;
    const newScale = clamp(scale * zoomFactor, 0.25, 4);
    applyZoom(newScale, localX, localY);
  };

  // Prevent the full page from zooming when you try to zoom on the map
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  });

  // Prevent default 2-finger scroll on mobile
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const preventTouchScroll = (e: TouchEvent) => {
      if (e.touches.length === 2) e.preventDefault();
    };

    viewport.addEventListener("touchmove", preventTouchScroll, { passive: false });
    return () => viewport.removeEventListener("touchmove", preventTouchScroll);
  }, []);

  useEffect(() => {
    const startTime = new Date(game.game_state.created_at).getTime();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  });

  useEffect(() => {
    const startTime = new Date(game.game_state.start_time).getTime();
    const interval = setInterval(() => {
      setRunTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  });

  useEffect(() => {
    let isMounted = true;
    let userRef: { id: string } | null = user;

    const fetchGameState = async () => {
      if (!userRef) return;
      try {
        const response = await fetch(`/api/game/${game.id}/state`);
        if (response.ok) {
          const data = await response.json();
          if (isMounted) setGameState(data);
        }
      } catch (err) {
        console.error("Failed to fetch game state:", err);
      }
    };

    fetchGameState(); // initial fetch
    const interval = setInterval(fetchGameState, 5000); // poll every 5s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [game.id, user]);

  if (!gameState) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading game state...</div>;
  }

  const isRunner = user.id === game.game_state.current_runner_id;
  const mapInfo = game.maps?.[0];
  const availableDestinations =
    mapInfo?.edges?.filter((edge: any) => edge.from === gameState.current_node)?.map((edge: any) => edge.to) || [];

  const currentPlayerHand = gameState.cards_in_hand?.[user.id] || [];
  const activeEffects = gameState.active_effects || [];
  const usedCards = gameState.used_cards || [];

  const handleMove = async () => {
    if (!selectedDestination) return;

    setIsLoading(true);
    const result = await moveToNode(game.id, selectedDestination);

    if (result?.error) alert(result.error);
    else window.location.reload();

    setIsLoading(false);
    setSelectedDestination("");
  };

  const handlePlayCard = async (card: any, target?: string) => {
    setIsLoading(true);
    const result = await playCard(game.id, card.id, target);

    if (result?.error) alert(result.error);
    else window.location.reload();

    setIsLoading(false);
    setTargetPlayer("");
  };

  const handleEndRun = async () => {
    setIsLoading(true);
    const result = await endRun(game.id);

    if (result?.error) alert(result.error);
    else window.location.reload();

    setIsLoading(false);
    setShowEndRunDialog(false);
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const remainingSecondsforMinutes = seconds % 3600;
    const minutes = Math.floor(remainingSecondsforMinutes / 60);
    const remainingSeconds = seconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  const getCardTypeIcon = (type: string) => {
    switch (type) {
      case "battle":
        return <Target className="w-4 h-4" />;
      case "roadblock":
        return <AlertTriangle className="w-4 h-4" />;
      case "curse":
        return <Zap className="w-4 h-4" />;
      case "utility":
        return <Users className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getCardTypeColor = (type: string) => {
    switch (type) {
      case "battle":
        return "bg-red-100 text-red-800 border-red-200";
      case "roadblock":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "curse":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "utility":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Find current runner's profile
  const currentRunnerProfile = game.game_players.find(
    (gp: any) => gp.player_id === game.game_state.current_runner_id,
  )?.profiles;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
                <p className="text-sm text-gray-600">{isRunner ? "You are the Runner" : "You are a Seeker"}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant={isRunner ? "default" : "secondary"}>
                Current Runner: {currentRunnerProfile?.username || currentRunnerProfile?.email}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Game Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Runner Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  Runner Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{formatTime(runTime)}</p>
                    <p className="text-sm text-gray-600">Run Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{gameState.runner_points || 0}</p>
                    <p className="text-sm text-gray-600">Points</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{gameState.current_node || "Start"}</p>
                    <p className="text-sm text-gray-600">Current Node</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{availableDestinations.length}</p>
                    <p className="text-sm text-gray-600">Destinations</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Effects */}
            {activeEffects.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Zap className="w-5 h-5 mr-2" />
                    Active Effects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {activeEffects.map((effect: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <span className="text-sm font-medium">{effect.effect}</span>
                        <Badge variant="outline" className="text-xs">
                          Active
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Map</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  ref={viewportRef}
                  className="relative w-full h-[540px] bg-gray-100 touch-none overflow-hidden"
                  // onWheel={handleWheel} // zoom with ctrl+wheel
                  onPointerDown={handlePointerDown} // start drag
                  onPointerMove={handlePointerMove} // dragging
                  onPointerUp={handlePointerUp} // stop drag
                  onPointerLeave={handlePointerUp} // stop drag if finger leaves
                  onTouchMove={handleTouchMove} // pinch zoom
                  onTouchEnd={handleTouchEnd}>
                  <motion.div
                    className="origin-top-left"
                    style={{ scale, x: offset.x, y: offset.y }}
                    animate={{ scale, x: offset.x, y: offset.y }}
                    transition={{ type: "spring", stiffness: 260, damping: 30 }}>
                    <MapSvg ref={svgRef} />
                  </motion.div>
                </div>
              </CardContent>
            </Card>

            {/* Movement */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2" />
                  Movement
                </CardTitle>
                <CardDescription>
                  {isRunner ? "Choose your next destination" : "Track the runner's movement"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Destinations:</p>
                    <div className="flex flex-wrap gap-2">
                      {availableDestinations.map((destination: string) => (
                        <Badge key={destination} variant="outline" className="text-sm">
                          {destination}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {isRunner && (
                    <div className="flex space-x-2">
                      <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDestinations.map((destination: string) => (
                            <SelectItem key={destination} value={destination}>
                              {destination}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleMove} disabled={!selectedDestination || isLoading}>
                        {isLoading ? "Moving..." : "Move"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* End Run */}
            {isRunner && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">End Run</CardTitle>
                  <CardDescription>End your run when you've been caught by the seekers</CardDescription>
                </CardHeader>
                <CardContent>
                  <Dialog open={showEndRunDialog} onOpenChange={setShowEndRunDialog}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" disabled={isLoading} className="text-white">
                        End Run
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>End Current Run?</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to end your run? You will become a seeker and the next player will
                          become the runner.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEndRunDialog(false)}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleEndRun}
                          disabled={isLoading}
                          className="text-white">
                          {isLoading ? "Ending..." : "End Run"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Player Hand (Seekers only) */}
          <div className="space-y-6">
            {!isRunner && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Your Hand ({currentPlayerHand.length} cards)
                  </CardTitle>
                  <CardDescription>Click on cards to see details or play them</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {currentPlayerHand.map((card: any) => (
                      <div key={card.id} className={`p-3 border rounded-lg ${getCardTypeColor(card.type)}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 flex-1">
                            {getCardTypeIcon(card.type)}
                            <div className="flex-1">
                              <p className="font-medium text-sm">{card.name}</p>
                              <p className="text-xs opacity-75 capitalize">{card.type}</p>
                            </div>
                          </div>
                          <div className="flex space-x-1">
                            {/* Card Details Dialog */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Target className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle className="flex items-center space-x-2">
                                    {getCardTypeIcon(card.type)}
                                    <span>{card.name}</span>
                                  </DialogTitle>
                                  <DialogDescription>
                                    <Badge className={getCardTypeColor(card.type)} variant="outline">
                                      {card.type}
                                    </Badge>
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-3">
                                  <div>
                                    <h4 className="font-medium mb-1">Description:</h4>
                                    <p className="text-sm text-gray-600">{card.description}</p>
                                  </div>
                                  <div>
                                    <h4 className="font-medium mb-1">Effect:</h4>
                                    <p className="text-sm text-gray-600">{card.effect}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            {/* Play Card Dialog */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={isLoading}>
                                  <Play className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Play Card: {card.name}</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to play this card? This action cannot be undone.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                  <p className="text-sm text-gray-600 mb-4">Effect: {card.effect}</p>
                                  {(card.type === "battle" || card.type === "curse") && (
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">Target Player (optional):</label>
                                      <Select value={targetPlayer} onValueChange={setTargetPlayer}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select target" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {game.game_players
                                            .filter((gp: any) => gp.player_id !== user.id)
                                            .map((gp: any) => (
                                              <SelectItem key={gp.player_id} value={gp.player_id}>
                                                {gp.profiles?.username || gp.profiles?.email}
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                </div>
                                <DialogFooter>
                                  <Button variant="outline">Cancel</Button>
                                  <Button onClick={() => handlePlayCard(card, targetPlayer)} disabled={isLoading}>
                                    {isLoading ? "Playing..." : "Play Card"}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </div>
                    ))}
                    {currentPlayerHand.length === 0 && (
                      <p className="text-gray-500 text-center py-4">No cards in hand</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Cards Played */}
            {usedCards.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Trash2 className="w-5 h-5 mr-2" />
                    Recent Cards Played ({usedCards.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {usedCards
                      .slice(-5)
                      .reverse()
                      .map((card: any, index: number) => {
                        const playerProfile = game.game_players.find(
                          (gp: any) => gp.player_id === card.usedBy,
                        )?.profiles;
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-50 border rounded text-sm">
                            <div className="flex items-center space-x-2">
                              {getCardTypeIcon(card.type)}
                              <span className="font-medium">{card.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {playerProfile?.username || playerProfile?.email}
                            </Badge>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Game Info */}

            <Card>
              <CardHeader>
                <CardTitle>Game Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Game Time:</span>
                    <span className="font-medium">{formatTime(elapsedTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Players:</span>
                    <span className="font-medium">{game.game_players?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Map:</span>
                    <span className="font-medium">{mapInfo?.name || "Default Map"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cards Played:</span>
                    <span className="font-medium">{Object.values(gameState.cards_in_hand || {}).flat().length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
