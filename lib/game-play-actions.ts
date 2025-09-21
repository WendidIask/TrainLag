"use server";

import { createServerClient } from "@/lib/supabase/server";

export async function moveToNode(gameId: string, newNode: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
        if (!game) return { error: "Game not found" };

        // Check if the target node has an active roadblock
        const { data: roadblocks } = await supabase
            .from("roadblocks")
            .select("*")
            .eq("game_id", gameId)
            .eq("node_name", newNode)
            .gte("expires_at", new Date().toISOString());

        if (roadblocks && roadblocks.length > 0) {
            return { error: `Node ${newNode} is blocked by a roadblock!` };
        }

        const updatedState = {
            ...gameState,
            updated_at: new Date().toISOString(),
        };

        if (user.id === gameState.current_runner_id) {
            // Runner moves - must validate connected nodes
            const mapInfo = game.maps?.[0];
            const availableDestinations = mapInfo?.edges?.filter((edge: any) => 
                edge.from.toLowerCase() === gameState.runner_node?.toLowerCase()
            )?.map((edge: any) => edge.to) || [];

            if (!availableDestinations.includes(newNode)) {
                return { error: "You can only move to connected nodes" };
            }

            updatedState.runner_node = newNode;
            updatedState.runner_points = (gameState.runner_points || 0) + 10;
        } else {
            // Seeker moves - can move to any node
            updatedState.seeker_node = newNode;

            // Draw card for seeker
            const { data: availableCards } = await supabase
                .from("cards")
                .select("*")
                .eq("game_id", gameId);

            if (availableCards && availableCards.length > 0) {
                const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                
                const newCard = {
                    id: `${randomCard.id}_${Date.now()}_${Math.random()}`,
                    name: randomCard.name,
                    type: randomCard.type,
                    description: randomCard.description,
                    effect: generateCardEffect(randomCard.type, randomCard.name),
                };

                const currentHand = gameState.cards_in_hand || [];
                updatedState.cards_in_hand = [...currentHand, newCard];
            }
        }

        const { error } = await supabase.from("game_state").update(updatedState).eq("game_id", gameId);
        if (error) return { error: "Failed to update game state: " + error.message };

        return { success: true };
    } catch (error) {
        console.error("Move error:", error);
        return { error: "An unexpected error occurred" };
    }
}

export async function playCard(gameId: string, cardId: string, targetPlayer?: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        // Get current game state
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        const playerHand = gameState.cards_in_hand || [];

        // Find the card to play
        const cardToPlay = playerHand.find((card: any) => card.id === cardId);
        if (!cardToPlay) return { error: "Card not found in your hand" };
        
        const updatedHand = playerHand.filter((card: any) => card.id !== cardId);

        // Add to discard pile
        const discardPile = gameState.discard_pile || [];
        discardPile.push({
            ...cardToPlay,
            usedBy: user.id,
            usedAt: new Date().toISOString(),
            targetPlayer,
        });

        // Initialize updated state
        const updatedState = {
            ...gameState,
            cards_in_hand: updatedHand,
            discard_pile: discardPile,
            updated_at: new Date().toISOString(),
        };

        // Apply card effects based on type
        const activeEffects = gameState.active_effects || [];

        switch (cardToPlay.type) {
            case "battle":
                activeEffects.push({
                    cardId: cardToPlay.id,
                    effect: "Runner location revealed",
                    player: user.id,
                    targetPlayer,
                    expiresAt: new Date(Date.now() + 60000).toISOString(), // 1 minute
                });
                break;

            case "roadblock":
                // Insert roadblock into dedicated table
                const expiresAt = new Date(Date.now() + 120000); // 2 minutes from now
                
                const { error: roadblockError } = await supabase
                    .from("roadblocks")
                    .insert({
                        game_id: gameId,
                        node_name: gameState.seeker_node,
                        placed_by: user.id,
                        expires_at: expiresAt.toISOString(),
                    });
                    
                if (roadblockError) {
                    return { error: "Failed to place roadblock: " + roadblockError.message };
                }
                break;

            case "curse":
                // Reduce runner's points
                updatedState.runner_points = Math.max(0, (gameState.runner_points || 0) - 20);
                activeEffects.push({
                    cardId: cardToPlay.id,
                    effect: "Runner cursed (-20 points)",
                    player: user.id,
                    targetPlayer,
                    expiresAt: new Date(Date.now() + 90000).toISOString(), // 1.5 minutes
                });
                break;

            case "utility":
                // Draw 2 additional cards
                const { data: availableCards } = await supabase
                    .from("cards")
                    .select("*")
                    .eq("game_id", gameId);

                if (availableCards && availableCards.length > 0) {
                    const newCards = [];
                    for (let i = 0; i < 2; i++) {
                        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                        newCards.push({
                            id: `${randomCard.id}_${Date.now()}_${i}_${Math.random()}`,
                            name: randomCard.name,
                            type: randomCard.type,
                            description: randomCard.description,
                            effect: generateCardEffect(randomCard.type, randomCard.name),
                        });
                    }
                    updatedState.cards_in_hand = [...updatedHand, ...newCards];
                }
                break;

            default:
                // Unknown card type - no effect
                break;
        }

        // Update active effects
        updatedState.active_effects = activeEffects;

        // Save updated game state
        const { error } = await supabase.from("game_state").update(updatedState).eq("game_id", gameId);
        if (error) return { error: "Failed to play card: " + error.message };
        
        return { success: true };
    } catch (error) {
        console.error("Play card error:", error);
        return { error: "An unexpected error occurred" };
    }
}

function generateCardEffect(type: string, cardName: string): string {
    switch (type) {
        case "battle":
            return "Force the runner to reveal their current location and next possible moves";
        case "roadblock":
            return "Block a specific path for the runner for 2 turns";
        case "curse":
            return "Reduce runner's points by 20 and slow their next move";
        case "utility":
            return "Draw 2 additional cards or peek at runner's hand";
        default:
            return "Special effect varies by card";
    }
}

export async function endRun(gameId: string) {
    const supabase = await createServerClient();
    
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        // Get current game and game state
        const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();

        if (!game || !gameState || gameState.current_runner_id !== user.id) {
            return { error: "You are not the current runner" };
        }

        const playerOrder = game.player_order || [];
        const currentRunnerIndex = playerOrder.indexOf(user.id);
        const nextRunnerIndex = (currentRunnerIndex + 1) % playerOrder.length;
        const nextRunnerId = playerOrder[nextRunnerIndex];

        // Update game state with new runner
        const { error: gameStateError } = await supabase
            .from("game_state")
            .update({
                current_runner_id: nextRunnerId,
                runner_points: 0, // Reset points for new runner
                active_effects: [], // Clear active effects
                start_time: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("game_id", gameId);

        if (gameStateError) {
            return { error: "Failed to update game state: " + gameStateError.message };
        }

        // Previous runner becomes seeker, gets 2 cards
        const { data: availableCards } = await supabase
            .from("cards")
            .select("*")
            .eq("game_id", gameId);

        if (availableCards && availableCards.length > 0) {
            const newCards = [];
            for (let i = 0; i < 2; i++) {
                const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                newCards.push({
                    id: `${randomCard.id}_${Date.now()}_${i}_${Math.random()}`,
                    name: randomCard.name,
                    type: randomCard.type,
                    description: randomCard.description,
                    effect: generateCardEffect(randomCard.type, randomCard.name),
                });
            }

            // Add cards to previous runner's hand (now seeker)
            const currentHand = gameState.cards_in_hand || [];
            const updatedHand = [...currentHand, ...newCards];

            const { error: handError } = await supabase
                .from("game_state")
                .update({
                    cards_in_hand: updatedHand,
                })
                .eq("game_id", gameId);

            if (handError) {
                console.error("Failed to update hand:", handError);
            }
        }

        return { success: true };
    } catch (error) {
        console.error("End run error:", error);
        return { error: "An unexpected error occurred" };
    }
}