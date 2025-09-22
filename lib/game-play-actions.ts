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

        const { data: map } = await supabase.from("maps").select("*").eq("game_id", gameId);
        if (!map) return { error: "Game not found" };

        const updatedState = {
            ...gameState,
            updated_at: new Date().toISOString(),
        };

        if (user.id === gameState.current_runner_id) {
            // Runner moves - must validate connected nodes and check if already visited
            const mapInfo = map?.[0];
            const availableDestinations = mapInfo?.edges?.filter((edge: any) => 
                edge.from.toLowerCase() === gameState.runner_node?.toLowerCase()
            )?.map((edge: any) => edge.to) || [];

            if (!availableDestinations.includes(newNode)) {
                return { error: "You can only move to connected nodes" };
            }

            // Check if the runner has already visited this node (in game_log)
            const gameLog = gameState.game_log || [];
            if (gameLog.includes(newNode)) {
                return { error: "You cannot move to a node you have already visited" };
            }

            updatedState.runner_node = newNode;
            updatedState.runner_points = (gameState.runner_points || 0) + 10;
            updatedState.game_log.push(newNode);
        } else {
            // Seeker moves - can move to any node, obstacles don't affect seekers
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

export async function clearRoadblock(gameId: string, nodeId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState || gameState.current_runner_id !== user.id) {
            return { error: "Only the current runner can clear roadblocks" };
        }

        // Remove roadblock from the specified node
        const { error } = await supabase
            .from("roadblocks")
            .delete()
            .eq("game_id", gameId)
            .eq("node_name", nodeId);

        if (error) {
            return { error: "Failed to clear roadblock: " + error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("Clear roadblock error:", error);
        return { error: "An unexpected error occurred" };
    }
}

export async function clearCurse(gameId: string, curseId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState || gameState.current_runner_id !== user.id) {
            return { error: "Only the current runner can clear curses" };
        }

        // Remove curse
        const { error } = await supabase
            .from("curses")
            .delete()
            .eq("game_id", gameId)
            .eq("id", curseId);

        if (error) {
            return { error: "Failed to clear curse: " + error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("Clear curse error:", error);
        return { error: "An unexpected error occurred" };
    }
}

export async function playCard(gameId: string, cardId: string, targetPlayer?: string, targetNode?: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        // Get current game state and game info
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        const { data: game } = await supabase.from("games").select("*").eq("id", gameId).single();
        const { data: map } = await supabase.from("maps").select("*").eq("game_id", gameId);
        if (!map) return { error: "Game not found" };
        
        if (!gameState) return { error: "Game state not found" };
        if (!game) return { error: "Game not found" };

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
                });
                break;

            case "roadblock":
                const { error: roadblockError } = await supabase
                    .from("roadblocks")
                    .insert({
                        game_id: gameId,
                        node_name: gameState.seeker_node,
                        placed_by: user.id,
                    });
                    
                if (roadblockError) {
                    return { error: "Failed to place roadblock: " + roadblockError.message };
                }
                break;

            case "curse":
                // Validate that targetNode was provided and is adjacent to seeker's position
                const mapInfo = map?.[0];
                const adjacentNodes = mapInfo?.edges?.filter((edge: any) => 
                    edge.from.toLowerCase() === gameState.seeker_node?.toLowerCase()
                )?.map((edge: any) => edge.to) || [];

                if (!targetNode) {
                    return { error: "You must select an adjacent node to curse the path to" };
                }
                if (!adjacentNodes.some((node: string) => node.toLowerCase() === targetNode.toLowerCase())) {
                    return { error: "You can only curse paths to adjacent nodes" };
                }

                const { error: curseError } = await supabase
                    .from("curses")
                    .insert({
                        game_id: gameId,
                        start_node: gameState.seeker_node,
                        end_node: targetNode,
                    });
                    
                if (curseError) {
                    return { error: "Failed to place curse: " + curseError.message };
                }
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
            return "Block a specific node for the runner for 2 turns";
        case "curse":
            return "Block a path between two connected nodes for 5 minutes";
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

        // Clear roadblocks and curses for this game
        const { error: roadblockError } = await supabase
            .from("roadblocks")
            .delete()
            .eq("game_id", gameId);

        if (roadblockError) {
            console.error("Failed to clear roadblocks:", roadblockError);
        }

        const { error: curseError } = await supabase
            .from("curses")
            .delete()
            .eq("game_id", gameId);

        if (curseError) {
            console.error("Failed to clear curses:", curseError);
        }

        // Update game state with new runner
        const { error: gameStateError } = await supabase
            .from("game_state")
            .update({
                current_runner_id: nextRunnerId,
                runner_points: 0, // Reset points for new runner
                active_effects: [], // Clear active effects
                start_time: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                game_log: [gameState.runner_node], // Start new game log with current position
                seeker_node: gameState.runner_node
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