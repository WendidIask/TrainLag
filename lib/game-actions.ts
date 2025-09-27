"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import mapPaths from "../components/data/map-paths.json";

type edge = { from: string; to: string, points: number };

interface User {
  email?: string;
  username: string;
  created_at?: string;
  updated_at?: string;
}

interface MapData {
  name: string;
  nodes: string[];
  edges: edge[];
}

interface Card {
  name: string;
  type: "battle" | "utility" | "roadblock" | "curse";
  description?: string;
}

export async function createGame(prevState: any, formData: FormData) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const { user } = data;
  if (!user) return { error: "You must be logged in to create a game" };

  const gameName = (formData.get("gameName") as string)?.trim();
  const playersJson = formData.get("players") as string;
  const cardsJson = formData.get("cards") as string; // single-card-per-row JSON
  const mapDataJson = JSON.stringify(mapPaths);

  if (!gameName) return { error: "A game name is required." };
  if (!cardsJson) return { error: "At least one card is required." };
  if (!mapDataJson) return { error: "A map is required." };

  function tryParseJSON<T>(json: string, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch (error) {
      console.error("Unable to parse JSON", error);
      return fallback;
    }
  }

  try {
    const players = tryParseJSON<User[]>(playersJson, []);
    const cards = tryParseJSON<Card[]>(cardsJson, []);
    const mapData = tryParseJSON<MapData[]>(mapDataJson, []);

    // Insert game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        name: gameName,
        creator_id: user.id,
        status: "setup",
      })
      .select()
      .single();

    if (gameError) return { error: "Failed to create game: " + gameError.message };

    // Add creator as player
    await supabase.from("game_players").insert({ game_id: game.id, player_id: user.id });

    // Add other players
    for (const player of players) {
      const { data: playerProfile, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .or(`email.eq.${player.username},username.eq.${player.username}`)
        .maybeSingle();

      if (!playerProfile || lookupError) continue;

      const { data: existingPlayer } = await supabase
        .from("game_players")
        .select("id")
        .eq("game_id", game.id)
        .eq("player_id", playerProfile.id)
        .maybeSingle();

      if (existingPlayer) continue;

      await supabase.from("game_players").insert({
        game_id: game.id,
        player_id: playerProfile.id,
      });
    }

    // Insert cards individually
    for (const card of cards) {
      const { data: insertedCard, error } = await supabase
        .from("cards")
        .insert({ game_id: game.id, ...card })
        .select();

      if (error) console.error("Error inserting card:", error);
    }

    // Insert map
    const { data: insertedMap, error: mapError } = await supabase
      .from("maps")
      .insert({ game_id: game.id, ...mapData })
      .select();

    if (mapError) console.error("Error inserting map:", mapError);

    return { success: true, gameId: game.id };
  } catch (error) {
    console.error("Create game error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}

export async function startGame(gameId: string) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) redirect("/");

  try {
    const { data: players } = await supabase
      .from("game_players")
      .select("player_id, profiles(username)")
      .eq("game_id", gameId);

    if (!players || players.length < 2) return { error: "Need at least 2 players to start the game" };

    const playerOrder = [...players].sort(() => Math.random() - 0.5).map((p) => p.player_id);

    const { error: updateError } = await supabase
      .from("games")
      .update({ status: "active", player_order: playerOrder })
      .eq("id", gameId);

    if (updateError) return { error: "Failed to start game: " + updateError.message };

    // Get available cards for the game
    const { data: availableCards } = await supabase
      .from("cards")
      .select("*")
      .eq("game_id", gameId);

    // Give each seeker 2 starting cards
    const initialCards: any[] = [];
    if (availableCards && availableCards.length > 0) {
      const seekers = playerOrder.slice(1); // All players except the runner (first player)
      
      for (const seekerId of seekers) {
        for (let i = 0; i < 2; i++) {
          const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
          initialCards.push({
            id: `${randomCard.id}_${Date.now()}_${seekerId}_${i}_${Math.random()}`,
            name: randomCard.name,
            type: randomCard.type,
            description: randomCard.description,
          });
        }
      }
    }

    const { error: initError } = await supabase.from("game_state").insert({
      game_id: gameId,
      current_runner_id: playerOrder[0],
      runner_node: "SYDNEY CBD",
      seeker_node: "SYDNEY CBD",
      runner_points: 0,
      cards_in_hand: initialCards, // Changed from available_cards: {} to cards_in_hand: initialCards
      discard_pile: [],
      active_effects: [],
      game_log: [],
      start_time: new Date().toISOString(),
      phase: "intermission"
    });

    if (initError) return { error: "Failed to insert game state: " + initError.message };

    return { success: true };
  } catch (error) {
    console.error("Start game error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}