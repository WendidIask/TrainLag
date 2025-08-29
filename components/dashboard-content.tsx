"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Users, Clock, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/actions";

interface Game {
  id: string;
  name: string;
  status: "setup" | "active" | "completed";
  created_at: string;
  game_players: { player_id: string }[];
  profiles: { username: string };
}

interface DashboardContentProps {
  user: { id: string; email?: string; user_metadata: { username: string } };
  games: Game[];
}

import { useState, useEffect } from "react";

export function GameDate({ dateString }: { dateString: string }) {
  const [formattedDate, setFormattedDate] = useState<string | null>(null);

  useEffect(() => {
    setFormattedDate(new Date(dateString).toLocaleDateString());
  }, [dateString]);

  if (!formattedDate) return null;

  return (
    <span className="flex items-center">
      <Clock className="w-4 h-4 mr-1" />
      {formattedDate}
    </span>
  );
}

export default function DashboardContent({ user, games }: DashboardContentProps) {
  const router = useRouter();

  const createNewGame = () => {
    router.push("/game/create");
  };

  const joinGame = (gameId: string, active: boolean) => {
    if (active) router.push(`/game/${gameId}/play`);
    else router.push(`/game/${gameId}/setup`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                <a href="/">Train Lag</a>
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user.user_metadata.username}</span>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await signOut();
                }}>
                <Button variant="outline" size="sm" type="submit">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Your Games</h2>
            <p className="text-gray-600 mt-1">Create new games or continue existing ones</p>
          </div>
          <Button onClick={createNewGame} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New Game
          </Button>
        </div>

        {games.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="text-gray-500 mb-4">
                <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold mb-2">No games yet</h3>
                <p>Create your first game to get started!</p>
              </div>
              <Button onClick={createNewGame} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Game
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.map((game) => (
              <Card key={game.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{game.name}</CardTitle>
                    <Badge
                      variant={
                        game.status === "active" ? "default" : game.status === "setup" ? "secondary" : "outline"
                      }>
                      {game.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    <div className="flex items-center space-x-4 text-sm">
                      <span className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        {game.game_players.length} players
                      </span>
                      <span className="flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        <GameDate dateString={game.created_at} />
                      </span>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Created by: {game.profiles.username}</p>
                    <Button
                      onClick={() => joinGame(game.id, game.status === "active")}
                      className="w-full"
                      variant={game.status === "active" ? "default" : "outline"}>
                      {game.status === "active"
                        ? "Continue Game"
                        : game.status === "setup"
                        ? "Setup Game"
                        : "View Game"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
