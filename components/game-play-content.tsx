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
import { ArrowLeft, Clock, MapPin, Target, Users, Zap, AlertTriangle, Play, Trash2, Search, ShieldAlert } from "lucide-react";
import { moveToNode, playCard, endRun, clearRoadblock, clearCurse, startRun, startPositioning } from "@/lib/game-play-actions";
import MapSvg from "./data/GameMap.svg";
import mapNodes from "./data/map-nodes.json";
import Link from 'next/link'

interface GamePlayContentProps {
  game: any;
  user: { id: string; email?: string };
}

export default function GamePlayContent({ game, user }: GamePlayContentProps) {
  const [gameState, setGameState] = useState(game.game_state?.[0] || null);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showEndRunDialog, setShowEndRunDialog] = useState(false);
  const [showStartRunDialog, setShowStartRunDialog] = useState(false);
  const [showStartPositioningDialog, setShowStartPositioningDialog] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<string>("");
  const [targetNode, setTargetNode] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [runTime, setRunTime] = useState(0);
  const [positioningTime, setPositioningTime] = useState(0);
  const [roadblocks, setRoadblocks] = useState([]);
  const [curses, setCurses] = useState([]);
  const [challenges, setChallenges] = useState([]);
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

        const res = await fetch(`/api/game/${game.id}/state?ts=${Date.now()}`, {
          cache: 'no-store', next: { revalidate: 0 }
        });
        console.log('[dbg] /state status', res.status);
        let stateData = null;
        try { stateData = await res.json(); } catch { /* 204/empty */ }
        console.log('[dbg] /state payload', stateData);
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

        // Fetch active curses
        const cursesResponse = await fetch(`/api/game/${game.id}/curses`);
        if (cursesResponse.ok) {
          const cursesData = await cursesResponse.json();
          if (isMounted) setCurses(cursesData);
        }

        // Fetch active challenges
        const challengesResponse = await fetch(`/api/game/${game.id}/challenges`);
        if (challengesResponse.ok) {
          const challengesData = await challengesResponse.json();
          if (isMounted) setChallenges(challengesData);
        }


      } catch (err) {
        console.error("Failed to fetch game data:", err);
      }
    };

    fetchGameData();
    const interval = setInterval(fetchGameData, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [game.id, user]);

  const getNodePosition = (nodeName: string) => {
    const node = mapNodes.find(n => n.name.toLowerCase() === nodeName.toLowerCase());
    return node ? { x: node.cx, y: node.cy } : { x: 0, y: 0 };
  };

  // Helper function to get SVG path from JSON for cursed paths
  const getSvgPathFromJson = (startNode: string, endNode: string) => {
    // Access the JSON data from the first document
    const mapData = game.maps?.[0];
    if (mapData?.edges) {
      const edge = mapData.edges.find((e: any) => 
        (e.from.toLowerCase() === startNode.toLowerCase() && e.to.toLowerCase() === endNode.toLowerCase()) ||
        (e.from.toLowerCase() === endNode.toLowerCase() && e.to.toLowerCase() === startNode.toLowerCase())
      );
      return edge?.path || null;
    }
    return null;
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

  // NEW: Positioning phase timer
  useEffect(() => {
    if (!gameState?.positioning_start_time) return;
    const startTime = new Date(gameState.positioning_start_time).getTime();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setPositioningTime(Math.max(0, 1200 - elapsed)); // 20 minutes = 1200 seconds
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.positioning_start_time]);

  if (!gameState) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading game state...</div>;
  }

  const isRunner = user.id === gameState.current_runner_id;
  const mapInfo = game.maps?.[0];
  
  // Check if we're in positioning phase
  const isPositioningPhase = gameState.phase === 'positioning';
  const isRunPhase = gameState.phase === 'running';
  const isWaitingForPositioning = gameState.phase === 'intermission';
  const isPositioningComplete = positioningTime <= 0 && isPositioningPhase;
  
  // Modified: Different destination logic for runner vs seeker
  let availableDestinations: string[] = [];
  let filteredDestinations: string[] = [];
  
  if (isRunner && (isRunPhase || isPositioningPhase)) {
    // Runner can only move to connected nodes during run phase, not during positioning
    if (isRunPhase) {
      availableDestinations = mapInfo?.edges?.filter((edge: any) => 
        edge.from.toLowerCase() === gameState.runner_node?.toLowerCase()
      )?.map((edge: any) => edge.to) || [];
      filteredDestinations = availableDestinations;
    }
  } else if (!isRunner && (isPositioningPhase || isRunPhase)) {
    // Seeker can move to any node on the map during positioning or running
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

  // Check if runner is at a location with obstacles
  const currentNodeRoadblocks = isRunner ? roadblocks.filter((rb: any) => rb.node_name.toLowerCase() === gameState.runner_node?.toLowerCase()) : [];
  const currentNodeCurses = isRunner ? curses.filter((curse: any) => 
    curse.start_node.toLowerCase() === gameState.game_log[gameState.game_log.length-1]?.toLowerCase() && curse.end_node.toLowerCase() === gameState.runner_node?.toLowerCase() || 
    curse.end_node.toLowerCase() === gameState.game_log[gameState.game_log.length-1]?.toLowerCase() && curse.start_node.toLowerCase() === gameState.runner_node?.toLowerCase()
  ) : [];
  const currentNodeChallenges = isRunner ? challenges.filter((rb: any) => rb.node_name.toLowerCase() === gameState.runner_node?.toLowerCase()) : [];

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

  const handleStartPositioning = async () => {
    setIsLoading(true);
    const result = await startPositioning(game.id);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

    setIsLoading(false);
    setShowStartPositioningDialog(false);
  };

  const handleStartRun = async () => {
    setIsLoading(true);
    const result = await startRun(game.id);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

    setIsLoading(false);
    setShowStartRunDialog(false);
  };

  const handleClearRoadblock = async (nodeId: string) => {
    setIsLoading(true);
    const result = await clearRoadblock(game.id, nodeId);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

    setIsLoading(false);
  };

  const handleClearCurse = async (curseId: string) => {
    setIsLoading(true);
    const result = await clearCurse(game.id, curseId);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

    setIsLoading(false);
  };

  const handlePlayCard = async (card: any, target?: string, node?: string) => {
    setIsLoading(true);
    const result = await playCard(game.id, card.id, target, node);

    if (result?.error) {
      alert(result.error);
    } else {
      window.location.reload();
    }

    setIsLoading(false);
    setTargetPlayer("");
    setTargetNode("");
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
          <div className="flex items-center justify-between min-h-16 py-2">
            {/* Left section - Back button and title */}
            <div className="flex items-center min-w-0 flex-1">
              <Button 
                variant="ghost" 
                onClick={() => router.push("/dashboard")} 
                className="mr-2 sm:mr-4 p-2 sm:px-3"
                size="sm"
              >
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 truncate">
                  {game.name}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600">
                  {isRunner ? "You are the Runner" : "You are a Seeker"}
                </p>
              </div>
            </div>

            {/* Right section - Badges (responsive) */}
            <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
              {/* Current Runner Badge - Hide text on mobile, show icon */}
              <Badge 
                variant={isRunner ? "default" : "secondary"} 
                className="text-xs sm:text-sm px-1 sm:px-2"
              >
                <Users className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">Current Runner: </span>
                <span className="hidden md:inline">
                  {currentRunnerProfile?.username || currentRunnerProfile?.email || "Unknown"}
                </span>
                <span className="sm:hidden md:hidden">
                  {(currentRunnerProfile?.username || currentRunnerProfile?.email || "Unknown").substring(0, 3)}...
                </span>
              </Badge>

              {/* Phase indicator badges - Stack on very small screens */}
              <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                {isWaitingForPositioning && (
                  <Badge 
                    variant="outline" 
                    className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs px-1 sm:px-2"
                  >
                    <Clock className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">Waiting to Start</span>
                    <span className="sm:hidden">Wait</span>
                  </Badge>
                )}
                {isPositioningPhase && (
                  <Badge 
                    variant="outline" 
                    className="bg-orange-50 text-orange-700 border-orange-200 text-xs px-1 sm:px-2"
                  >
                    <MapPin className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">Positioning Phase</span>
                    <span className="sm:hidden">Pos</span>
                  </Badge>
                )}
                {isRunPhase && (
                  <Badge 
                    variant="outline" 
                    className="bg-green-50 text-green-700 border-green-200 text-xs px-1 sm:px-2"
                  >
                    <Play className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">Running Phase</span>
                    <span className="sm:hidden">Run</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Game Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* NEW: Waiting for Positioning Phase */}
            {isWaitingForPositioning && (
              <Card className="border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <CardTitle className="flex items-center text-yellow-800">
                    <Clock className="w-5 h-5 mr-2" />
                    Ready to Start Next Round
                  </CardTitle>
                  <CardDescription className="text-yellow-700">
                    {isRunner 
                      ? "You are the new runner! Wait for a seeker to start the positioning phase."
                      : "The previous run has ended. Start the positioning phase when everyone is ready."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!isRunner && (
                    <div className="text-center">
                      <Dialog open={showStartPositioningDialog} onOpenChange={setShowStartPositioningDialog}>
                        <DialogTrigger asChild>
                          <Button size="lg" className="bg-yellow-600 hover:bg-yellow-700 text-white">
                            <Users className="w-5 h-5 mr-2" />
                            Start Positioning Phase
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Start Positioning Phase?</DialogTitle>
                            <DialogDescription>
                              This will begin the 20-minute positioning phase. All seekers (including yourself) will be able to move around the map to position strategically before the runner starts their turn.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowStartPositioningDialog(false)}>
                              Wait a moment
                            </Button>
                            <Button 
                              onClick={handleStartPositioning} 
                              disabled={isLoading}
                              className="bg-yellow-600 hover:bg-yellow-700 text-white"
                            >
                              {isLoading ? "Starting..." : "Start Positioning"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {isRunner && (
                    <div className="text-center py-4">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="flex items-center justify-center space-x-2">
                          <Users className="w-5 h-5 text-blue-600" />
                          <p className="text-blue-800 font-medium">Waiting for seekers to start positioning</p>
                        </div>
                        <p className="text-sm text-blue-600 mt-2">
                          Any seeker can start the positioning phase when the team is ready.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* NEW: Positioning Phase Status */}
            {isPositioningPhase && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center text-orange-800">
                    <Clock className="w-5 h-5 mr-2" />
                    Positioning Phase
                  </CardTitle>
                  <CardDescription className="text-orange-700">
                    {isRunner 
                      ? "Seekers are positioning themselves. Wait for the timer to finish before starting your run."
                      : "Position yourself strategically! You have time to move around and prepare before the runner starts."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-600">{formatTime(positioningTime)}</p>
                    <p className="text-sm text-orange-700 mt-1">
                      {positioningTime > 0 ? "Time remaining for positioning" : "Positioning complete - Ready to start run!"}
                    </p>
                  </div>
                  
                  {/* NEW: Start Run button for runner when positioning is complete */}
                  {isRunner && isPositioningComplete && (
                    <div className="mt-4 text-center">
                      <Dialog open={showStartRunDialog} onOpenChange={setShowStartRunDialog}>
                        <DialogTrigger asChild>
                          <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white">
                            <Play className="w-5 h-5 mr-2" />
                            Start Your Run
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Start Your Run?</DialogTitle>
                            <DialogDescription>
                              The seekers have finished positioning. Are you ready to start your run?
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowStartRunDialog(false)}>
                              Wait a moment
                            </Button>
                            <Button 
                              onClick={handleStartRun} 
                              disabled={isLoading}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {isLoading ? "Starting..." : "Start Run"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Runner Info - Modified to show different info during positioning */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  {isPositioningPhase ? "Game Status" : "Runner Status"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {isRunPhase && (
                    <>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{formatTime(runTime)}</p>
                        <p className="text-sm text-gray-600">Run Time</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{gameState.runner_points || 0}</p>
                        <p className="text-sm text-gray-600">Points</p>
                      </div>
                    </>
                  )}
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{gameState.runner_node || "Start"}</p>
                    <p className="text-sm text-gray-600">{isRunner ? "Your Position" : "Runner Position"}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{availableDestinations.length}</p>
                    <p className="text-sm text-gray-600">
                      {isRunner ? (isRunPhase ? "Destinations" : "Starting Position") : "Available Nodes"}
                    </p>
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
                    {activeEffects.map((index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <Badge variant="outline" className="text-xs">
                          Active
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Runner Obstacles at Current Location - Only during run phase */}
            {isRunner && isRunPhase && (currentNodeRoadblocks.length > 0 || currentNodeCurses.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ShieldAlert className="w-5 h-5 mr-2 text-orange-600" />
                    Obstacles at Your Location
                  </CardTitle>
                  <CardDescription>
                    You have encountered obstacles at {gameState.runner_node}. Complete the challenges to clear them!
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {currentNodeRoadblocks.map((roadblock: any) => (
                      <div
                        key={roadblock.id}
                        className="flex flex-col space-y-3 p-3 bg-red-50 border border-red-200 rounded">
                        <div className="flex items-start space-x-3">
                          <AlertTriangle className="w-5 h-5 text-red-600 mt-1" />
                          <div className="flex-1">
                            <p className="font-medium text-red-800">Roadblock at {roadblock.node_name}</p>
                            {roadblock.description && (
                              <p className="text-sm text-red-600 mt-1">{roadblock.description}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleClearRoadblock(roadblock.node_name)}
                          disabled={isLoading}
                          className="text-red-600 border-red-300 hover:bg-red-50 self-end"
                        >
                          {isLoading ? "Clearing..." : "Clear Roadblock"}
                        </Button>
                      </div>
                    ))}
                    {currentNodeCurses.map((curse: any) => (
                      <div
                        key={curse.id}
                        className="flex flex-col space-y-3 p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-start space-x-3">
                          <Zap className="w-5 h-5 text-purple-600 mt-1" />
                          <div className="flex-1">
                            <p className="font-medium text-purple-800">
                              Cursed Path: {curse.start_node} ↔ {curse.end_node}
                            </p>
                            {curse.description && (
                              <p className="text-sm text-purple-600 mt-1">{curse.description}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleClearCurse(curse.id)}
                          disabled={isLoading}
                          className="text-purple-600 border-purple-300 hover:bg-purple-50 self-end"
                        >
                          {isLoading ? "Clearing..." : "Clear Curse"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Obstacles */}
            {(roadblocks.length > 0 || curses.length > 0 || challenges.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Active Obstacles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {roadblocks.map((roadblock: any) => (
                      <div
                        key={roadblock.id}
                        className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium">Roadblock at {roadblock.node_name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs text-red-600">
                          Node Blocked
                        </Badge>
                      </div>
                    ))}
                    {curses.map((curse: any) => (
                      <div
                        key={curse.id}
                        className="flex items-center justify-between p-2 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-center space-x-2">
                          <Zap className="w-4 h-4 text-purple-600" />
                          <span className="text-sm font-medium">Cursed path: {curse.start_node} ↔ {curse.end_node}</span>
                        </div>
                        <Badge variant="outline" className="text-xs text-purple-600">
                          Path Blocked
                        </Badge>
                      </div>
                    ))}
                    {challenges.map((challenge: any) => (
                      <div
                        key={challenge.id}
                        className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                        <div className="flex items-center space-x-2">
                          <Target className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium">Roadblock at {challenge.node_name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs text-red-600">
                          Node Challenged
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
                <CardTitle>
                  <div className="flex flex-row items-center justify-between gap-2">
                    <h1 className="text-xl font-bold">Map</h1>
                    <Button asChild className="w-auto px-3 py-1 text-sm">
                      <Link
                        target="_blank"
                        href="https://www.google.com/maps/d/viewer?ll=-33.8190444882586%2C151.03183450363866&z=11&mid=1Du0Pg5r3uPZxyORBNmCYSsoQCxBWuE4"
                      >
                        Geographical Map
                      </Link>
                    </Button>
                  </div>
                </CardTitle>
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
                      
                      {/* Runner's path history */}
                      {gameState.game_log && gameState.game_log.length > 1 && (() => {
                        
                        const pathSegments = [];
                        
                        for (let i = 0; i < gameState.game_log.length-1; i++) {
                          const currentNode = gameState.game_log[i];
                          const nextNode = gameState.game_log[i + 1];
                          
                          const d = getSvgPathFromJson(currentNode, nextNode);
                          if (!d) console.warn('No path for', currentNode, '→', nextNode);

                          const pathData = getSvgPathFromJson(currentNode, nextNode);
                          
                          if (pathData) {
                            pathSegments.push(
                              <path
                                key={`history-${i}`}
                                d={pathData}
                                stroke="#f97316"
                                strokeWidth={0.8}
                                fill="none"
                                style={{ 
                                  opacity: 0.7,
                                  filter: "drop-shadow(0 1px 2px rgba(249, 115, 22, 0.3))"
                                }}
                              />
                            );
                          }
                        }
                        
                        return <g>{pathSegments}</g>;
                      })()}
                      
                      {/* Cursed paths */}
                      {curses.map((curse: any) => {
                        const pathData = getSvgPathFromJson(curse.start_node, curse.end_node);
                        if (!pathData) return null;
                        
                        return (
                          <g key={curse.id}>
                            {/* Main cursed path - thicker purple overlay */}
                            <path
                              d={pathData}
                              stroke="#8b5cf6"
                              strokeWidth={0.8}
                              fill="none"
                              style={{ 
                                filter: "drop-shadow(0 1px 3px rgba(139, 92, 246, 0.4))",
                                opacity: 0.8
                              }}
                            />
                            {/* Inner glow effect */}
                            <path
                              d={pathData}
                              stroke="#a855f7"
                              strokeWidth={0.6}
                              fill="none"
                              style={{ 
                                filter: "blur(0.1px)",
                                opacity: 0.6
                              }}
                            />
                          </g>
                        );
                      })}
                      
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
                            <text
                              x={nodePos.x}
                              y={nodePos.y + 0.3}
                              textAnchor="middle"
                              fill="#fff"
                              fontSize="1.2"
                              fontWeight="bold"
                            >
                              🚧
                            </text>
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
            {!(isPositioningPhase && isRunner) && (<Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2" />
                  Movement
                </CardTitle>
                <CardDescription>
                  {isRunner ? "Choose your next destination from connected nodes" : "Search and select any node to move to"}
                  {isRunner && (currentNodeRoadblocks.length > 0 || currentNodeCurses.length > 0) && (
                    <span className="block text-red-600 font-medium mt-1">
                      ⚠️ Clear all obstacles at your location before moving
                    </span>
                  )}
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
                        <Select 
                          value={selectedDestination} 
                          onValueChange={setSelectedDestination}
                          disabled={currentNodeRoadblocks.length > 0 || currentNodeCurses.length > 0}
                        >
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
                        <Button 
                          onClick={handleMove} 
                          disabled={
                            !selectedDestination || 
                            isLoading || 
                            (isRunner && (currentNodeRoadblocks.length > 0 || currentNodeCurses.length > 0))
                          }
                        >
                          {isLoading ? "Moving..." : "Move"}
                        </Button>
                      </div>
                      
                      {/* Blocking message for runner */}
                      {isRunner && (currentNodeRoadblocks.length > 0 || currentNodeCurses.length > 0) && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <p className="text-sm text-red-800 font-medium">
                              Movement blocked by {currentNodeRoadblocks.length} roadblock(s) and {currentNodeCurses.length} curse(s)
                            </p>
                          </div>
                          <p className="text-xs text-red-600 mt-1">
                            Clear all obstacles at your location to continue moving.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Seeker UI: Search bar and filtered results (unchanged)
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
            </Card> )}

            {/* End Run */}
            {isRunner && !isPositioningPhase && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">End Run</CardTitle>
                  <CardDescription>End your run when you&apos;ve been caught by the seekers</CardDescription>
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
                                    <Badge className={getCardTypeColor(card.type)} variant="outline">
                                      {card.type}
                                    </Badge>
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="py-4 space-y-3">
                                  <div>
                                    <p className="text-sm text-gray-600">{card.description}</p>
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
                                  {card.type === "curse" && (() => {
                                    // Get adjacent nodes to current seeker position for curse placement
                                    const mapInfo = game.maps?.[0];
                                    const adjacentNodes = mapInfo?.edges?.filter((edge: any) => 
                                      edge.from.toLowerCase() === gameState.seeker_node?.toLowerCase()
                                    )?.map((edge: any) => edge.to) || [];
                                    
                                    return (
                                      <div className="space-y-2">
                                        <label className="text-sm font-medium">Target Node (curse path endpoint):</label>
                                        <p className="text-xs text-gray-500 mb-2">
                                          Select which adjacent node to curse the path to from your current position: {gameState.seeker_node}
                                        </p>
                                        <Select value={targetNode} onValueChange={setTargetNode}>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select target node" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {adjacentNodes.map((node: string) => (
                                              <SelectItem key={node} value={node}>
                                                {node}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        {adjacentNodes.length === 0 && (
                                          <p className="text-xs text-red-600">No adjacent nodes available from your current position.</p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <DialogFooter>
                                  <Button variant="outline">Cancel</Button>
                                  <Button 
                                    onClick={() => handlePlayCard(card, targetPlayer, targetNode)} 
                                    disabled={isLoading || (card.type === "curse" && !targetNode)}
                                  >
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
          </div>
        </div>
      </main>
    </div>
  );
}