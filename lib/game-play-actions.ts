"use server";

import { createServerClient } from "@/lib/supabase/server";

export async function moveToNode(gameId: string, newNode: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        const { data: game } = await supabase.from("games").select("current_runner_id").eq("id", gameId).single();
        if (!game) return { error: "Game not found" };

        const updatedState = {
            ...gameState,
            updated_at: new Date().toISOString(),
        };

        if (user.id === game.current_runner_id) {
            // Runner moves
            updatedState.runner_node = newNode;
            updatedState.runner_points = (gameState.runner_points || 0) + 10;
        } else {
            // Seeker moves → track movement
            const seekerMovements = gameState.seeker_node || [];
            seekerMovements.push({
                userId: user.id,
                node: newNode,
                movedAt: new Date().toISOString(),
            });
            updatedState.seeker_node = seekerMovements;

            // Draw card into shared seeker hand
            const { data: cardSets } = await supabase.from("card_sets").select("*").eq("game_id", gameId);
            if (cardSets && cardSets.length > 0) {
                const randomSet = cardSets[Math.floor(Math.random() * cardSets.length)];
                const randomCard = randomSet.cards[Math.floor(Math.random() * randomSet.cards.length)];

                const newCard = {
                    id: `${randomSet.id}_${Date.now()}_${Math.random()}`,
                    name: randomCard,
                    type: randomSet.type,
                    description: `${randomSet.type.charAt(0).toUpperCase() + randomSet.type.slice(1)} card: ${randomCard}`,
                    effect: generateCardEffect(randomSet.type, randomCard),
                };

                const currentHands = gameState.cards_in_hand || {};
                updatedState.cards_in_hand = [...(currentHands || []), newCard];
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
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in" };

    try {
        // Get current game state
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        const playerHand = gameState.cards_in_hand || {};

        // Find the card to play
        const cardToPlay = playerHand.find((card: any) => card.id === cardId);
        if (!cardToPlay) return { error: "Card not found in your hand" };
        const updatedHand = playerHand.filter((card: any) => card.id !== cardId);

        // Add to used cards
        const usedCards = gameState.discard_pile || [];
        usedCards.push({
            ...cardToPlay,
            usedBy: user.id,
            usedAt: Date.now(),
            targetPlayer,
        });

        // Initialize updated state
        const updatedState = {
            ...gameState,
            cards_in_hand: updatedHand,
            discard_pile: usedCards,
            updated_at: new Date().toISOString(),
        };

        // Apply card effects based on type
        const activeEffects = updatedState.active_effects || [];

        switch (cardToPlay.type) {
            case "battle":
                activeEffects.push({
                    cardId: cardToPlay.id,
                    effect: "Runner location revealed",
                    player: user.id,
                    targetPlayer,
                    expiresAt: Date.now() + 60000, // 1 minute
                });
                break;

            case "roadblock":
                // Insert roadblock into dedicated table
                const expiresAt = new Date(Date.now() + 120000); // 2 minutes from now
                
                const { error: roadblockError } = await supabase
                    .from("roadblocks")
                    .insert({
                        game_id: gameId,
                        node_name: updatedState.runner_node,
                        placed_by: user.id,
                        expires_at: expiresAt.toISOString(),
                    });
                    
                if (roadblockError) {
                    return { error: "Failed to place roadblock: " + roadblockError.message };
                }
                break;

            case "curse":
                // Reduce runner's points
                updatedState.runner_points = Math.max(0, updatedState.runner_points - 20);
                activeEffects.push({
                    cardId: cardToPlay.id,
                    effect: "Runner cursed (-20 points)",
                    player: user.id,
                    targetPlayer,
                    expiresAt: Date.now() + 90000, // 1.5 minutes
                });
                break;

            case "utility":
                // For utility cards, player draws 2 additional cards
                const { data: cardSets } = await supabase.from("card_sets").select("*").eq("game_id", gameId);

                if (cardSets && cardSets.length > 0) {
                    const newCards = [];
                    for (let i = 0; i < 2; i++) {
                        const randomSet = cardSets[Math.floor(Math.random() * cardSets.length)];
                        const randomCard = randomSet.cards[Math.floor(Math.random() * randomSet.cards.length)];
                        newCards.push({
                            id: `${randomSet.id}_${Date.now()}_${i}_${Math.random()}`,
                            name: randomCard,
                            type: randomSet.type,
                            description: `${
                                randomSet.type.charAt(0).toUpperCase() + randomSet.type.slice(1)
                            } card: ${randomCard}`,
                            effect: generateCardEffect(randomSet.type, randomCard),
                        });
                    }
                    updatedState.cards_in_hand =  [...(updatedHand || []), ...newCards];;
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
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be logged in" };

    try {
        // Get current game
        const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();

        console.log(game);
        if (!game || gameState.current_runner_id !== user.id) {
            return { error: "You are not the current runner" };
        }

        const playerOrder = game.player_order || [];
        const currentRunnerIndex = playerOrder.indexOf(user.id);
        const nextRunnerIndex = (currentRunnerIndex + 1) % playerOrder.length;
        const nextRunnerId = playerOrder[nextRunnerIndex];

        // Update game with new runner
        const { error: gameError } = await supabase
            .from("game_state")
            .update({
                current_runner_id: nextRunnerId,
                updated_at: new Date().toISOString(),
            })
            .eq("game_id", gameId);

        if (gameError) {
            return { error: "Failed to update game: " + gameError.message };
        }

        if (gameState) {
            const currentHands = gameState.cards_in_hand || {};

            // Previous runner becomes seeker, gets 2 cards
            const { data: cardSets } = await supabase.from("card_sets").select("*").eq("game_id", gameId);

            if (cardSets && cardSets.length > 0) {
                const newCards = [];
                for (let i = 0; i < 2; i++) {
                    const randomSet = cardSets[Math.floor(Math.random() * cardSets.length)];
                    const randomCard = randomSet.cards[Math.floor(Math.random() * randomSet.cards.length)];
                    newCards.push({
                        id: `${randomSet.id}_${Date.now()}_${i}_${Math.random()}`,
                        name: randomCard,
                        type: randomSet.type,
                        description: `${
                            randomSet.type.charAt(0).toUpperCase() + randomSet.type.slice(1)
                        } card: ${randomCard}`,
                        effect: generateCardEffect(randomSet.type, randomCard),
                    });
                }
                currentHands[user.id] = [...(currentHands[user.id] || []), ...newCards];
            }

            // New runner starts with no cards
            currentHands[nextRunnerId] = [];

            // Update game state
            const { error: stateError } = await supabase
                .from("game_state")
                .update({
                    runner_points: 0, // Reset points for new runner
                    cards_in_hand: currentHands,
                    active_effects: [], // Clear active effects
                    start_time: new Date().toISOString(),
                })
                .eq("game_id", gameId);

            if (stateError) {
                return { error: "Failed to update game state: " + stateError.message };
            }
        }

        return { success: true };
    } catch (error) {
        console.error("End run error:", error);
        return { error: "An unexpected error occurred" };
    }
}