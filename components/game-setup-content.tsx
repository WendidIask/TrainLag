"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Users, Map, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { startGame } from "@/lib/game-actions";
import { useState } from "react";

interface GameSetupContentProps {
  game: any;
  user: { id: string; email?: string };
}

export default function GameSetupContent({ game, user }: GameSetupContentProps) {
  const [isStarting, setIsStarting] = useState(false);
  const router = useRouter();

  const handleStartGame = async () => {
    setIsStarting(true);
    const result = await startGame(game.id);

    if (result?.error) {
      alert(result.error);
      setIsStarting(false);
    } else {
      router.push(`/game/${game.id}/play`);
    }
  };

  const totalCards = game.card_sets?.reduce((sum: number, set: any) => sum + (set.cards?.length || 0), 0) || 0;
  const mapInfo = game.maps?.[0] || null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
              <p className="text-sm text-gray-600">Game Setup</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Game Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Game Overview</CardTitle>
              <CardDescription>Review your game configuration before starting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center space-x-3">
                  <Users className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-semibold">{game.game_players?.length || 0} Players</p>
                    <p className="text-sm text-gray-600">Ready to play</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Layers className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="font-semibold">{totalCards} Cards</p>
                    <p className="text-sm text-gray-600">Across {game.card_sets?.length || 0} sets</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Map className="w-8 h-8 text-purple-600" />
                  <div>
                    <p className="font-semibold">{mapInfo?.nodes?.length || 0} Nodes</p>
                    <p className="text-sm text-gray-600">{mapInfo?.edges?.length || 0} connections</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Players */}
          <Card>
            <CardHeader>
              <CardTitle>Players</CardTitle>
              <CardDescription>All players who will participate in this game</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {game.game_players?.map((gamePlayer: any, index: number) => (
                  <Badge
                    key={gamePlayer.player_id}
                    variant={gamePlayer.player_id === game.creator_id ? "default" : "secondary"}
                    className="text-sm py-1 px-3">
                    {gamePlayer.profiles?.username || gamePlayer.profiles?.email}
                    {gamePlayer.player_id === game.creator_id && " (Host)"}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Card Sets */}
          <Card>
            <CardHeader>
              <CardTitle>Card Sets</CardTitle>
              <CardDescription>Cards that will be used during the game</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {game.card_sets?.map((set: any) => (
                  <div key={set.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{set.name}</h4>
                      <Badge variant="outline" className="capitalize">
                        {set.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{set.cards?.length || 0} cards</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Map Info */}
          <Card>
            <CardHeader>
              <CardTitle>Game Map</CardTitle>
              <CardDescription>The playing field for your chase game</CardDescription>
            </CardHeader>
            <CardContent>
              {mapInfo && (
                <div className="p-4 border rounded-lg bg-gray-50">
                  <h4 className="font-semibold mb-2">{mapInfo.name}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Nodes:</span> {mapInfo.nodes?.length || 0}
                    </div>
                    <div>
                      <span className="text-gray-600">Connections:</span> {mapInfo.edges?.length || 0}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Game Rules Reminder */}
          <Card>
            <CardHeader>
              <CardTitle>Game Rules</CardTitle>
              <CardDescription>Quick reminder of how the game works</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>• Player order will be randomized when the game starts</p>
                <p>• The first player becomes the Runner, others are Seekers</p>
                <p>• Seekers start with 2 cards and draw 1 card each time they move to a new node</p>
                <p>• When the Runner is caught, they become a Seeker and the next player becomes the Runner</p>
                <p>• Use cards strategically to help catch the Runner or hinder other players</p>
              </div>
            </CardContent>
          </Card>

          {/* Start Game */}
          <div className="flex justify-center">
            <Button
              onClick={handleStartGame}
              disabled={isStarting}
              size="lg"
              className="bg-green-600 hover:bg-green-700">
              <Play className="w-5 h-5 mr-2" />
              {isStarting ? "Starting Game..." : "Start Game"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
