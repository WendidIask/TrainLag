"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type node = "Start" | "Center" | "North" | "South" | "East" | "West" | "End";
type edge = { from: node; to: node };

interface User {
    email?: string;
    username: string;
    created_at?: string;
    updated_at?: string;
}

interface MapData {
    name: string;
    nodes: node[];
    edges: edge[];
}

interface CardSet {
    name: string;
    type: "battle" | "utility" | "roadblock";
    cards: string[];
}

export async function createGame(prevState: any, formData: FormData) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in to create a game" };

    const gameName = (formData.get("gameName") as string)?.trim();
    const gameDescription = formData.get("gameDescription") as string;
    const playersJson = formData.get("players") as string;
    const cardSetsJson = formData.get("cardSets") as string;
    const mapDataJson = formData.get("mapData") as string;

    if (!gameName) return { error: "A game name is required." };
    if (!cardSetsJson) return { error: "At least one card set is required." };
    if (!mapDataJson) return { error: "A map is required." };

    function tryParseJSON<T>(json: string, fb: T): T {
        if (!json) return fb;
        try {
            const parsed = JSON.parse(json);
            return parsed as T;
        } catch (error) {
            console.error(`Unable to parse JSON`, error);
            return fb;
        }
    }

    try {
        const players = tryParseJSON<User[]>(playersJson, []);
        const mapData = tryParseJSON<MapData>(mapDataJson, []);
        const cardSets = tryParseJSON<CardSet[]>(cardSetsJson, []);

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

        await supabase.from("game_players").insert({ game_id: game.id, player_id: user.id });

        for (const player of players) {
            console.log("Adding player:", player);

            const { data: playerProfile, error: lookupError } = await supabase
                .from("profiles")
                .select("id")
                .or(`email.eq.${player.username},username.eq.${player.username}`)
                .maybeSingle();

            if (lookupError) {
                console.error(`Error finding player ${player.username}:`, lookupError);
                continue;
            }
            if (!playerProfile) {
                console.warn(`Player not found: ${player.username}`);
                continue;
            }

            const { data: existingPlayer } = await supabase
                .from("game_players")
                .select("id")
                .eq("game_id", game.id)
                .eq("player_id", playerProfile.id)
                .maybeSingle();

            if (existingPlayer) {
                console.log(`Player ${player.username} already in game, skipping`);
                continue;
            }

            const { error: insertError } = await supabase.from("game_players").insert({
                game_id: game.id,
                player_id: playerProfile.id,
            });

            if (insertError) console.error(`Error adding player ${player.username}:`, insertError);
            else console.log(`Player ${player.username} added to game.`);
        }
        
        console.log("Inserting card sets and map data:", cardSets, mapData, game.id);
        for (const cardSet of cardSets) {
            const { data, error } = await supabase
                .from("card_sets")
                .insert({ game_id: game.id, ...cardSet })
                .select();

                console.log("Insert result:", { data, error });
        }
        await supabase.from("maps").insert({ game_id: game.id, ...mapData });

        return { success: true, gameId: game.id };
    } catch (error) {
        console.error("Create game error:", error);
        return { error: "An unexpected error occurred. Please try again" };
    }
}

export async function startGame(gameId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) redirect("/");

    try {
        const { data: players } = await supabase
            .from("game_players")
            .select("player_id, profiles(username)")
            .eq("game_id", gameId);

        if (!players || players.length < 2) return { error: "Need at least 2 players to start the game" };

        // Randomise player order
        const playerOrder = [...players].sort(() => Math.random() - 0.5).map((p) => p.player_id);
        console.log("Player order:", playerOrder);

        // Update game status
        const { error: updateError } = await supabase
            .from("games")
            .update({
                status: "active",
                player_order: playerOrder,
            })
            .eq("id", gameId);

        if (updateError) return { error: "Failed to start game: " + updateError.message };

        // Initialize game state and set first player as runner
        const { error: initError } = await supabase.from("game_state").insert({
            game_id: gameId,
            current_runner_id: playerOrder[0],
            current_node: "Start",
            runner_points: 0,
            available_cards: {},
            discard_pile: [],
            active_effects: [],
            game_log: [],
            start_time: new Date().toISOString(),
        });
        if (initError) return { error: "Failed to insert player: " + initError.message };

        return { success: true };
    } catch (error) {
        console.error("Start game error:", error);
        return { error: "An unexpected error occurred. Please try again." };
    }
}
