"use server"

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function createGame(prevState: any, formData: FormData) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "You must be logged in to create a game" }

  const gameName = formData.get("gameName") as string
  const gameDescription = formData.get("gameDescription") as string
  const playersJson = formData.get("players") as string
  const cardSetsJson = formData.get("cardSets") as string
  const mapDataJson = formData.get("mapData") as string

  if (!gameName?.trim()) return { error: "Game name is required" }

  try {
    const players = JSON.parse(playersJson || "[]")
    const cardSets = JSON.parse(cardSetsJson || "[]")
    const mapData = JSON.parse(mapDataJson || "null")

    // Create the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        name: gameName.trim(),
        creator_id: user.id,
        status: "setup",
      })
      .select()
      .single()

    if (gameError) return { error: "Failed to create game: " + gameError.message }

    // Add creator as first player
    await supabase.from("game_players").insert({
      game_id: game.id,
      player_id: user.id,
    })

    // Add other players (for now, we'll just store usernames - in a real app, you'd look up user IDs)
    // Add other players (look up by email or username)
for (const player of players) {
  console.log("Adding player:", player);

  // Look up user by email or username
  const { data: playerProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .or(`email.eq.${player.username},username.eq.${player.username}`)
    .maybeSingle();

  if (lookupError) {
    console.error(`Error finding player ${player.username}:`, lookupError);
    continue; // Skip this player if the lookup failed
  }

  if (!playerProfile) {
    console.warn(`Player not found: ${player.username}`);
    continue;
  }

  // Check if this player is already in the game
  const { data: existingPlayer } = await supabase
    .from("game_players")
    .select("id")
    .eq("game_id", game.id)
    .eq("player_id", playerProfile.id)
    .maybeSingle();

  if (existingPlayer) {
    console.log(`Player ${player.username} already in game, skipping.`);
    continue;
  }

  // Insert into game_players
  const { error: insertError } = await supabase
    .from("game_players")
    .insert({
      game_id: game.id,
      player_id: playerProfile.id,
    });

  if (insertError) {
    console.error(`Error adding player ${player.username}:`, insertError);
  } else {
    console.log(`Player ${player.username} added to game.`);
  }
}


    // Add card sets with defaults if none provided
    const finalCardSets =
      cardSets.length > 0
        ? cardSets
        : [
            {
              name: "Default Battle Cards",
              type: "battle",
              cards: ["Quick Strike", "Power Attack", "Defensive Stance"],
            },
            {
              name: "Default Utility Cards",
              type: "utility",
              cards: ["Extra Move", "Peek Ahead", "Double Points"],
            },
            {
              name: "Default Roadblock Cards",
              type: "roadblock",
              cards: ["Block Path", "Slow Down", "Detour Required"],
            },
          ]

    for (const cardSet of finalCardSets) {
      await supabase.from("card_sets").insert({
        game_id: game.id,
        name: cardSet.name,
        type: cardSet.type,
        cards: cardSet.cards,
      })
    }

    // Add map with default if none provided
    const finalMapData = mapData || {
      name: "Default Map",
      nodes: ["Start", "Center", "North", "South", "East", "West", "End"],
      edges: [
        { from: "Start", to: "Center" },
        { from: "Center", to: "North" },
        { from: "Center", to: "South" },
        { from: "Center", to: "East" },
        { from: "Center", to: "West" },
        { from: "North", to: "End" },
        { from: "South", to: "End" },
        { from: "East", to: "End" },
        { from: "West", to: "End" },
      ],
    }

    await supabase.from("maps").insert({
      game_id: game.id,
      name: finalMapData.name,
      nodes: finalMapData.nodes,
      edges: finalMapData.edges,
    })

    return { success: true, gameId: game.id }
  } catch (error) {
    console.error("Create game error:", error)
    return { error: "An unexpected error occurred. Please try again." }
  }
}

export async function startGame(gameId: string) {
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  try {
    // Get game players to randomize order
    const { data: players } = await supabase
      .from("game_players")
      .select("player_id, profiles(username)")
      .eq("game_id", gameId)

    if (!players || players.length < 2) {
      return { error: "Need at least 2 players to start the game" }
    }

    // Randomize player order
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5)
    const playerOrder = shuffledPlayers.map((p) => p.player_id)
    console.log("Player order:", playerOrder)

    // Update game status and set first player as runner
    const { error: updateError } = await supabase
      .from("games")
      .update({
        status: "active",
        player_order: playerOrder,
        start_time: new Date().toISOString(),
      })
      .eq("id", gameId)

    if (updateError) {
      return { error: "Failed to start game: " + updateError.message }
    }

    // Initialize game state
    await supabase.from("game_state").insert({
      game_id: gameId,
      current_runner_id: playerOrder[0],
      current_node: "Start",
      runner_points: 0,
      seeker_hands: {},
      used_cards: [],
      active_effects: [],
      game_log: [],
    })

    return { success: true }
  } catch (error) {
    console.error("Start game error:", error)
    return { error: "An unexpected error occurred. Please try again." }
  }
}
