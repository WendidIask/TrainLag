"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
// prettier-ignore
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Clock, MapPin, Target, Users, Zap, AlertTriangle, Play, Trash2, Search } from "lucide-react";
import { motion } from "framer-motion";
import { moveToNode, playCard, endRun } from "@/lib/game-play-actions";
import MapSvg from "./data/GameMap.svg";
import mapNodes from "./data/map-nodes.json";

interface GamePlayContentProps {
  game: any;
  user: { id: string; email?: string };
}

export default function GamePlayContent({ game, user }: GamePlayContentProps) {
  const [gameState, setGameState] = useState(game.game_state?.[0] || null);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showEndRunDialog, setShowEndRunDialog] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [runTime, setRunTime] = useState(0);
  const [roadblocks, setRoadblocks] = useState([]);
  const router = useRouter();

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastDistance = useRef<number | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgSize, setSvgSize] = useState({ width: 400, height: 400 });
  const [viewportSize, setViewportSize] = useState({ width: 400, height: 400 });

  useEffect(() => {
    if (svgRef.current) {
      const bbox = svgRef.current.getBBox();
      setSvgSize({ width: bbox.width, height: bbox.height });
    }

    let isMounted = true;

    const fetchGameData = async () => {
      if (!user) return;
      try {
        // Fetch game state
        const stateResponse = await fetch(`/api/game/${game.id}/state`);
        if (stateResponse.ok) {
          const stateData = await stateResponse.json();
          if (isMounted) setGameState(stateData);
        }

        // Fetch active roadblocks
        const roadblocksResponse = await fetch(`/api/game/${game.id}/roadblocks`);
        if (roadblocksResponse.ok) {
          const roadblocksData = await roadblocksResponse.json();
          if (isMounted) setRoadblocks(roadblocksData);
        }
      } catch (err) {
        console.error("Failed to fetch game data:", err);
      }
    };

    fetchGameData();
    const interval = setInterval(fetchGameData, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [game.id, user]);

  const getNodePosition = (nodeName: string) => {
    const node = mapNodes.find(n => n.name.toLowerCase() === nodeName.toLowerCase());
    return node ? { x: node.cx, y: node.cy } : { x: 0, y: 0 };
  };

  // Map interaction functions - simplified and fixed
  const [isDragging, setIsDragging] = useState(false);

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !lastPointer.current) return;
    
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;

    setOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));

    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    lastPointer.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = clamp(scale * zoomFactor, 0.25, 4);
    
    const scaleRatio = newScale / scale;
    
    setOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * scaleRatio,
      y: mouseY - (mouseY - prev.y) * scaleRatio
    }));
    
    setScale(newScale);
  };

  // Fixed: Single wheel event listener with proper passive handling
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = clamp(scale * zoomFactor, 0.25, 4);
      
      const scaleRatio = newScale / scale;
      
      setOffset(prev => ({
        x: mouseX - (mouseX - prev.x) * scaleRatio,
        y: mouseY - (mouseY - prev.y) * scaleRatio
      }));
      
      setScale(newScale);
    };

    // Key fix: explicitly set passive: false to allow preventDefault
    viewport.addEventListener('wheel', handleWheelEvent, { passive: false });
    
    return () => {
      viewport.removeEventListener('wheel', handleWheelEvent);
    };
  }, [scale]); // Include scale in dependencies

  // Touch handling for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      lastPointer.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      setIsDragging(false); // Stop dragging when starting pinch
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      lastDistance.current = distance;
      lastPointer.current = null; // Clear drag pointer
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    
    if (e.touches.length === 1 && isDragging && lastPointer.current) {
      const dx = e.touches[0].clientX - lastPointer.current.x;
      const dy = e.touches[0].clientY - lastPointer.current.y;

      setOffset(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));

      lastPointer.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastDistance.current) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      
      if (Math.abs(currentDistance - lastDistance.current) < 2) return; // Ignore tiny movements
      
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      // Get pinch center relative to viewport
      const pinchCenterX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const pinchCenterY = (t1.clientY + t2.clientY) / 2 - rect.top;
      
      const zoomDelta = currentDistance / lastDistance.current;
      const newScale = clamp(scale * zoomDelta, 0.25, 4);
      
      if (newScale !== scale) {
        // Calculate what point in the content we're zooming towards
        const contentX = (pinchCenterX - offset.x) / scale;
        const contentY = (pinchCenterY - offset.y) / scale;
        
        // Calculate new offset to keep that content point under the pinch center
        const newOffsetX = pinchCenterX - contentX * newScale;
        const newOffsetY = pinchCenterY - contentY * newScale;
        
        setOffset({ x: newOffsetX, y: newOffsetY });
        setScale(newScale);
      }
      
      lastDistance.current = currentDistance;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastPointer.current = null;
    lastDistance.current = null;
  };

  // Fixed: Separate touch event handling for preventing scroll
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const preventTouchScroll = (e: TouchEvent) => {
      if (e.touches.length === 2) e.preventDefault();
    };

    // Key fix: explicitly set passive: false for touch events too
    viewport.addEventListener("touchmove", preventTouchScroll, { passive: false });
    return () => viewport.removeEventListener("touchmove", preventTouchScroll);
  }, []);

  // Timer effects
  useEffect(() => {
    if (!gameState?.created_at) return;
    const startTime = new Date(gameState.created_at).getTime();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.created_at]);

  useEffect(() => {
    if (!gameState?.start_time) return;
    const startTime = new Date(gameState.start_time).getTime();
    const interval = setInterval(() => {
      setRunTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.start_time]);

  if (!gameState) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading game state...</div>;
  }

  const isRunner = user.id === gameState.current_runner_id;
  const mapInfo = game.maps?.[0];
  
  // Modified: Different destination logic for runner vs seeker
  let availableDestinations: string[] = [];
  let filteredDestinations: string[] = [];
  
  if (isRunner) {
    // Runner can only move to connected nodes
    availableDestinations = mapInfo?.edges?.filter((edge: any) => 
      edge.from.toLowerCase() === gameState.runner_node?.toLowerCase()
    )?.map((edge: any) => edge.to) || [];
    filteredDestinations = availableDestinations;
  } else {
    // Seeker can move to any node on the map
    availableDestinations = mapNodes.map(node => node.name);
    // Filter based on search query for seekers
    filteredDestinations = searchQuery.trim() === "" 
      ? availableDestinations
      : availableDestinations.filter(destination => 
          destination.toLowerCase().includes(searchQuery.toLowerCase())
        );
  }

  const currentPlayerHand = gameState.cards_in_hand || [];
  const activeEffects = gameState.active_effects || [];
  const discardPile = gameState.discard_pile || [];

  const handleMove = async () => {
    if (!selectedDestination) return;

    setIsLoading(true);
    const result = await moveToNode(game.id, selectedDestination);

    if (result?.error) {
      alert(result.error);
    } else {
      // Refresh game state
      window.location.reload();
    }

    setIsLoading(false);
    setSelectedDestination("");
  };

  const handlePlayCard = async (card: any, target?: string) => {
    setIsLoading(true);
    const result = await playCard(game.id, card.id, target);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

    setIsLoading(false);
    setTargetPlayer("");
  };

  const handleEndRun = async () => {
    setIsLoading(true);
    const result = await endRun(game.id);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

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
  const currentRunnerProfile = game.game_players?.find(
    (gp: any) => gp.player_id === gameState.current_runner_id,
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
                Current Runner: {currentRunnerProfile?.username || currentRunnerProfile?.email || "Unknown"}
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
                    <p className="text-2xl font-bold text-purple-600">{gameState.runner_node || "Start"}</p>
                    <p className="text-sm text-gray-600">Current Node</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{availableDestinations.length}</p>
                    <p className="text-sm text-gray-600">{isRunner ? "Destinations" : "Available Nodes"}</p>
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

            {/* Map */}
            <Card>
              <CardHeader>
                <CardTitle>Map</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  ref={viewportRef}
                  className="relative w-full h-[540px] bg-gray-100 cursor-move overflow-hidden select-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  style={{ touchAction: 'none' }}
                >
                  <div
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                      transformOrigin: '0 0',
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                  >
                    <svg ref={svgRef} viewBox="0 0 200 200" width={800} height={800}>
                      <MapSvg width={200} height={200} viewBox="0 0 200 200" />
                      
                      {/* Roadblock indicators */}
                      {roadblocks.map((roadblock: any) => {
                        const nodePos = getNodePosition(roadblock.node_name);
                        return (
                          <g key={roadblock.id}>
                            <circle
                              cx={nodePos.x}
                              cy={nodePos.y}
                              r={1}
                              fill="rgba(239, 68, 68, 0.8)"
                              stroke="#b91c1c"
                              strokeWidth={0.2}
                            />
                          </g>
                        );
                      })}

                      {/* Current runner position */}
                      {gameState.runner_node && (() => {
                        const nodePos = getNodePosition(gameState.runner_node);
                        return (
                          <circle
                            cx={nodePos.x}
                            cy={nodePos.y}
                            r={1}
                            fill="#3b82f6"
                            stroke="#fff"
                            strokeWidth={0.2}
                            style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.15))" }}
                          />
                        );
                      })()}
                    </svg>
                  </div>
                  
                  {/* Zoom controls */}
                  <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white rounded-lg shadow-md p-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newScale = clamp(scale * 1.2, 0.25, 4);
                        setScale(newScale);
                      }}
                    >
                      +
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newScale = clamp(scale * 0.8, 0.25, 4);
                        setScale(newScale);
                      }}
                    >
                      -
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setScale(1);
                        setOffset({ x: 0, y: 0 });
                      }}
                    >
                      Reset
                    </Button>
                  </div>
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
                  {isRunner ? "Choose your next destination from connected nodes" : "Search and select any node to move to"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isRunner ? (
                    // Runner UI: Show available destinations as badges
                    <>
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
                    </>
                  ) : (
                    // Seeker UI: Search bar and filtered results
                    <>
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            type="text"
                            placeholder="Search for a node..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        
                        {searchQuery.trim() !== "" && (
                          <div>
                            <p className="text-sm text-gray-600 mb-2">
                              Showing {filteredDestinations.length} of {availableDestinations.length} nodes
                            </p>
                            <div className="max-h-32 overflow-y-auto border rounded-md">
                              {filteredDestinations.slice(0, 10).map((destination: string) => (
                                <button
                                  key={destination}
                                  onClick={() => {
                                    setSelectedDestination(destination);
                                    setSearchQuery(destination);
                                  }}
                                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm ${
                                    selectedDestination === destination ? 'bg-blue-50 text-blue-600' : ''
                                  }`}
                                >
                                  {destination}
                                </button>
                              ))}
                              {filteredDestinations.length > 10 && (
                                <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50">
                                  ... and {filteredDestinations.length - 10} more. Keep typing to narrow results.
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {selectedDestination && (
                          <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                            <div className="flex items-center space-x-2">
                              <MapPin className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800">Selected: {selectedDestination}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedDestination("");
                                setSearchQuery("");
                              }}
                              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </Button>
                          </div>
                        )}
                      </div>

                      <Button 
                        onClick={handleMove} 
                        disabled={!selectedDestination || isLoading}
                        className="w-full"
                      >
                        {isLoading ? "Moving..." : `Move to ${selectedDestination || "selected node"}`}
                      </Button>
                    </>
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
                                            ?.filter((gp: any) => gp.player_id !== user.id)
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
            {discardPile.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Trash2 className="w-5 h-5 mr-2" />
                    Recent Cards Played ({discardPile.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {discardPile
                      .slice(-5)
                      .reverse()
                      .map((card: any, index: number) => {
                        const playerProfile = game.game_players?.find(
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
                              {playerProfile?.username || playerProfile?.email || "Unknown"}
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
                    <span className="text-gray-600">Cards in Hand:</span>
                    <span className="font-medium">{currentPlayerHand.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active Roadblocks:</span>
                    <span className="font-medium">{roadblocks.length}</span>
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