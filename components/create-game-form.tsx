"use client";

import type React from "react";
import { useState, useActionState, useEffect, startTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, X, Upload, Users, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { createGame } from "@/lib/game-actions";

interface Player {
  id: string;
  username: string;
}

interface Card {
  id: string;
  name: string;
  description: string;
  type: "battle" | "roadblock" | "curse" | "utility";
}

interface MapData {
  name: string;
  nodes: string[];
  edges: { from: string; to: string }[];
}

interface SubmitButtonProps {
  handleClick: () => void;
  pending?: boolean;
}

type CardType = "battle" | "roadblock" | "curse" | "utility";

export function SubmitButton({ handleClick, pending }: SubmitButtonProps) {
  return (
    <Button type="button" disabled={pending} size="lg" className="bg-blue-600 hover:bg-blue-700" onClick={handleClick}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Creating Game...
        </>
      ) : (
        "Create Game"
      )}
    </Button>
  );
}

interface CreateGameFormProps {
  user: { id: string; email?: string };
}

export default function CreateGameForm({ user }: CreateGameFormProps) {
  const [gameName, setGameName] = useState("");
  const [gameDescription, setGameDescription] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerUsername, setNewPlayerUsername] = useState("");
  const [playerCheckLoading, setPlayerCheckLoading] = useState(false);
  const [playerCheckError, setPlayerCheckError] = useState<string | null>(null);

  const [cards, setCards] = useState<Card[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<CardType>("utility");
  const [isOpen, setIsOpen] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Record<CardType, boolean>>({
    battle: false,
    roadblock: false,
    curse: false,
    utility: false,
  });

  const cardInputRef = useRef<HTMLInputElement | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [state, formAction] = useActionState(createGame, null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state?.success && state?.gameId) {
      router.push(`/game/${state.gameId}/setup`);
    }
  }, [state, router]);

  /** ---------------------------
   ** Submit Handler
   ** --------------------------- */
  const handleClickSubmit = async () => {
    setPending(true);
    const formData = new FormData();
    formData.append("gameName", gameName);
    formData.append("gameDescription", gameDescription);
    formData.append("players", JSON.stringify(players));
    formData.append("cards", JSON.stringify(cards));
    formData.append("mapData", JSON.stringify(mapData));

    startTransition(() => {
      formAction(formData);
      setPending(false);
    });
  };

  /** ---------------------------
   ** Player Validation
   ** --------------------------- */
  const addPlayer = async () => {
    const username = newPlayerUsername.trim();
    if (!username) return;

    setPlayerCheckLoading(true);
    setPlayerCheckError(null);

    try {
      const res = await fetch("/api/setup/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const { exists, player } = await res.json();

      if (!exists) {
        setPlayerCheckError("No player found with that username or email.");
        return;
      }

      if (players.find((p) => p.username === player.username)) {
        setPlayerCheckError("This player is already added.");
        return;
      }

      setPlayers((prev) => [...prev, player]);
      setNewPlayerUsername("");
    } catch {
      setPlayerCheckError("Error checking player. Please try again.");
    } finally {
      setPlayerCheckLoading(false);
    }
  };

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter((p) => p.id !== playerId));
  };

  /** ---------------------------
   ** Card Upload
   ** --------------------------- */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleCardSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedFile) {
      alert("Please upload a card file first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const lines = content.split("\n").filter((line) => line.trim());

        const newCards: Card[] = lines.map((line) => {
          const [name, description] = line.split("|").map((s) => s.trim());
          return { id: crypto.randomUUID(), name, description: description || "", type: selectedType };
        });

        setCards((prev) => [...prev, ...newCards]);
        setSelectedFile(null);
        if (cardInputRef.current) cardInputRef.current.value = "";
      } catch (error) {
        alert("Error parsing card file. Please check the format.");
        console.error(error);
      }
    };
    reader.readAsText(selectedFile);
  };

  const removeCard = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  /** ---------------------------
   ** Map Upload
   ** --------------------------- */
  const handleMapUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        setMapData(data);
      } catch {
        alert("Error parsing map file. Please ensure it's valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const getCardTypeColor = (type: CardType) => {
    switch (type) {
      case "battle":
        return "bg-red-100 text-red-800";
      case "roadblock":
        return "bg-yellow-100 text-yellow-800";
      case "curse":
        return "bg-purple-100 text-purple-800";
      case "utility":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  /** ---------------------------
   ** Group cards by type
   ** --------------------------- */
  const cardsByType: Record<CardType, Card[]> = {
    battle: [],
    roadblock: [],
    curse: [],
    utility: [],
  };
  cards.forEach((c) => cardsByType[c.type].push(c));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Create New Game</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form className="space-y-8" onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}>
          {state?.error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-700 px-4 py-3 rounded">{state.error}</div>
          )}

          {/* Step 1: Game Info */}
          <Card>
            <CardHeader>
              <CardTitle>Game Information</CardTitle>
              <CardDescription>Set up the basic details for your game</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="game-name">Game Name</Label>
                <Input id="game-name" value={gameName} onChange={(e) => setGameName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="game-description">Description (Optional)</Label>
                <Textarea id="game-description" value={gameDescription} onChange={(e) => setGameDescription(e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Players */}
          <Card>
            <CardHeader>
              <CardTitle>Add Players</CardTitle>
              <CardDescription>Invite other players to join your game</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-2 items-start">
                <div className="flex-1">
                  <Input value={newPlayerUsername} onChange={(e) => setNewPlayerUsername(e.target.value)} placeholder="Enter player email or username" onKeyDown={(e) => e.key === "Enter" && addPlayer()} disabled={playerCheckLoading} />
                  {playerCheckError && <p className="text-sm text-red-600 mt-1">{playerCheckError}</p>}
                </div>
                <Button type="button" onClick={addPlayer} disabled={playerCheckLoading}>
                  {playerCheckLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add
                </Button>
              </div>

              {players.length > 0 && (
                <div className="space-y-2">
                  <Label>Players ({players.length + 1} total)</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="flex items-center"><Users className="w-3 h-3 mr-1" />You (Host)</Badge>
                    {players.map((player) => (
                      <Badge key={player.id} variant="outline" className="flex items-center">
                        {player.username}
                        <Button type="button" variant="ghost" size="sm" className="ml-1 h-4 w-4 p-0" onClick={() => removePlayer(player.id)}><X className="w-3 h-3" /></Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Cards</CardTitle>
              <CardDescription>Upload cards for your game</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Label htmlFor="card-upload">Upload Cards (Optional)</Label>
              <div className="flex space-x-2 items-start">
                <Input id="card-upload" type="file" accept=".txt,.csv" onChange={handleFileSelect} ref={cardInputRef} className="cursor-pointer flex-1" />
                <DropdownMenu onOpenChange={(open) => setIsOpen(open)}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-32 capitalize flex items-center justify-between">
                      {selectedType} {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-32">
                    {(["battle","roadblock","curse","utility"] as CardType[]).map((type) => (
                      <DropdownMenuItem key={type} onClick={() => setSelectedType(type)}>{type}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedFile && (
                  <Button type="button" variant="default" onClick={handleCardSubmit}>
                    <Plus className="w-4 h-4 mr-2" /> Add
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">Format per line: Card Name | Description (optional)</p>

              {/* Cards Preview by Type */}
              {(["battle","roadblock","curse","utility"] as CardType[]).map((type) => {
                const list = cardsByType[type];
                if (!list.length) return null;
                const showAll = expandedTypes[type];
                return (
                  <div key={type} className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className={getCardTypeColor(type)}>{type}</Badge>
                      {list.length > 2 && (
                        <Button type="button" size="sm" variant="link" onClick={() => setExpandedTypes(prev => ({ ...prev, [type]: !prev[type] }))}>
                          {showAll ? "Show Less" : `Show All (${list.length})`}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {(showAll ? list : list.slice(0,2)).map((card) => (
                        <div key={card.id} className="flex items-center justify-between p-2 border rounded-md bg-white">
                          <div>
                            <p className="font-medium">{card.name}</p>
                            {card.description && <p className="text-sm text-gray-500">{card.description}</p>}
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeCard(card.id)}><X className="w-4 h-4" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Step 4: Map */}
          <Card>
            <CardHeader>
              <CardTitle>Game Map</CardTitle>
              <CardDescription>Upload the map with nodes and edge connections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input type="file" accept=".json" onChange={handleMapUpload} className="cursor-pointer" />
              {mapData && (
                <div className="p-3 border rounded-lg bg-green-50 flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">{mapData.name}</p>
                    <p className="text-sm text-green-600">{mapData.nodes.length} nodes, {mapData.edges.length} connections</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <SubmitButton handleClick={handleClickSubmit} pending={pending} />
          </div>
        </form>
      </main>
    </div>
  );
}
