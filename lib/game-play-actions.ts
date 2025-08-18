"use server"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}

export async function moveToNode(gameId: string, newNode: string) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be logged in" }
  }

  try {
    // Get current game state
    const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single()

    if (!gameState) {
      return { error: "Game state not found" }
    }

    // Update game state
    const updatedState = {
      ...gameState,
      current_node: newNode,
      runner_points: gameState.runner_points + 10, // Award points for moving
      updated_at: new Date().toISOString(),
    }

    // Check if user is a seeker (not the runner) - they draw a card when moving
    const { data: game } = await supabase.from("games").select("current_runner_id").eq("id", gameId).single()

    if (game && user.id !== game.current_runner_id) {
      // Generate a random card for the seeker
      const { data: cardSets } = await supabase.from("card_sets").select("*").eq("game_id", gameId)

      if (cardSets && cardSets.length > 0) {
        // Pick a random card from available sets
        const randomSet = cardSets[Math.floor(Math.random() * cardSets.length)]
        const randomCard = randomSet.cards[Math.floor(Math.random() * randomSet.cards.length)]

        const newCard = {
          id: `${randomSet.id}_${Date.now()}_${Math.random()}`,
          name: randomCard,
          type: randomSet.type,
          description: `${randomSet.type.charAt(0).toUpperCase() + randomSet.type.slice(1)} card: ${randomCard}`,
          effect: generateCardEffect(randomSet.type, randomCard),
        }

        // Add card to seeker's hand
        const currentHands = gameState.seeker_hands || {}
        currentHands[user.id] = [...(currentHands[user.id] || []), newCard]
        updatedState.seeker_hands = currentHands
      }
    }

    const { error } = await supabase.from("game_state").update(updatedState).eq("game_id", gameId)

    if (error) {
      return { error: "Failed to update game state: " + error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Move error:", error)
    return { error: "An unexpected error occurred" }
  }
}

export async function playCard(gameId: string, cardId: string, targetPlayer?: string) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be logged in" }
  }

  try {
    // Get current game state
    const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single()

    if (!gameState) {
      return { error: "Game state not found" }
    }

    const currentHands = gameState.seeker_hands || {}
    const playerHand = currentHands[user.id] || []

    // Find the card to play
    const cardToPlay = playerHand.find((card: any) => card.id === cardId)
    if (!cardToPlay) {
      return { error: "Card not found in your hand" }
    }

    // Remove card from player's hand
    currentHands[user.id] = playerHand.filter((card: any) => card.id !== cardId)

    // Add to used cards
    const usedCards = gameState.used_cards || []
    usedCards.push({
      ...cardToPlay,
      usedBy: user.id,
      usedAt: Date.now(),
      targetPlayer,
    })

    // Apply card effect
    const updatedState = {
      ...gameState,
      seeker_hands: currentHands,
      used_cards: usedCards,
      updated_at: new Date().toISOString(),
    }

    // Apply specific card effects
    applyCardEffect(updatedState, cardToPlay, user.id, targetPlayer)

    const { error } = await supabase.from("game_state").update(updatedState).eq("game_id", gameId)

    if (error) {
      return { error: "Failed to play card: " + error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Play card error:", error)
    return { error: "An unexpected error occurred" }
  }
}

export async function endRun(gameId: string) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be logged in" }
  }

  try {
    // Get current game
    const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single()

    if (!game || game.current_runner_id !== user.id) {
      return { error: "You are not the current runner" }
    }

    const playerOrder = game.player_order || []
    const currentRunnerIndex = playerOrder.indexOf(user.id)
    const nextRunnerIndex = (currentRunnerIndex + 1) % playerOrder.length
    const nextRunnerId = playerOrder[nextRunnerIndex]

    // Update game with new runner
    const { error: gameError } = await supabase
      .from("games")
      .update({
        current_runner_id: nextRunnerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gameId)

    if (gameError) {
      return { error: "Failed to update game: " + gameError.message }
    }

    // Get current game state
    const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single()

    if (gameState) {
      const currentHands = gameState.seeker_hands || {}

      // Previous runner becomes seeker, gets 2 cards
      const { data: cardSets } = await supabase.from("card_sets").select("*").eq("game_id", gameId)

      if (cardSets && cardSets.length > 0) {
        const newCards = []
        for (let i = 0; i < 2; i++) {
          const randomSet = cardSets[Math.floor(Math.random() * cardSets.length)]
          const randomCard = randomSet.cards[Math.floor(Math.random() * randomSet.cards.length)]
          newCards.push({
            id: `${randomSet.id}_${Date.now()}_${i}_${Math.random()}`,
            name: randomCard,
            type: randomSet.type,
            description: `${randomSet.type.charAt(0).toUpperCase() + randomSet.type.slice(1)} card: ${randomCard}`,
            effect: generateCardEffect(randomSet.type, randomCard),
          })
        }
        currentHands[user.id] = [...(currentHands[user.id] || []), ...newCards]
      }

      // New runner starts with no cards
      currentHands[nextRunnerId] = []

      // Update game state
      const { error: stateError } = await supabase
        .from("game_state")
        .update({
          runner_points: 0, // Reset points for new runner
          seeker_hands: currentHands,
          active_effects: [], // Clear active effects
          updated_at: new Date().toISOString(),
        })
        .eq("game_id", gameId)

      if (stateError) {
        return { error: "Failed to update game state: " + stateError.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error("End run error:", error)
    return { error: "An unexpected error occurred" }
  }
}

function generateCardEffect(type: string, cardName: string): string {
  switch (type) {
    case "battle":
      return "Force the runner to reveal their current location and next possible moves"
    case "roadblock":
      return "Block a specific path for the runner for 2 turns"
    case "curse":
      return "Reduce runner's points by 20 and slow their next move"
    case "utility":
      return "Draw 2 additional cards or peek at runner's hand"
    default:
      return "Special effect varies by card"
  }
}

function applyCardEffect(gameState: any, card: any, playerId: string, targetPlayer?: string) {
  const activeEffects = gameState.active_effects || []

  switch (card.type) {
    case "battle":
      activeEffects.push({
        cardId: card.id,
        effect: "Runner location revealed",
        player: playerId,
        expiresAt: Date.now() + 60000, // 1 minute
      })
      break
    case "roadblock":
      activeEffects.push({
        cardId: card.id,
        effect: "Path blocked",
        player: playerId,
        expiresAt: Date.now() + 120000, // 2 minutes
      })
      break
    case "curse":
      gameState.runner_points = Math.max(0, gameState.runner_points - 20)
      activeEffects.push({
        cardId: card.id,
        effect: "Runner cursed (-20 points)",
        player: playerId,
        expiresAt: Date.now() + 90000, // 1.5 minutes
      })
      break
    case "utility":
      // Draw additional cards - handled in the main function
      break
  }

  gameState.active_effects = activeEffects
}
