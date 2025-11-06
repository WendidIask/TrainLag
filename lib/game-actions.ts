"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createGame(prevState: any, formData: FormData) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const { user } = data;
  if (!user) return { error: "You must be logged in to create a game" };

  const gameName = (formData.get("gameName") as string)?.trim();
  const playersJson = formData.get("players") as string;
  const cardsJson = formData.get("cards") as string; // single-card-per-row JSON

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