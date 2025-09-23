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
            // Runner moves - only during running phase
            if (gameState.phase !== 'running') {
                return { error: "Runner can only move during the running phase" };
            }

            // Must validate connected nodes and check if already visited
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
            // Seeker moves - can move during positioning or running phases
            if (gameState.phase !== 'positioning' && gameState.phase !== 'running') {
                return { error: "Invalid game phase for movement" };
            }

            updatedState.seeker_node = newNode;

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

export async function startPositioning(gameId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        // Validate that we're in waiting phase
        if (gameState.phase !== 'intermission') {
            return { error: "Positioning can only be started from waiting phase" };
        }

        // Validate that the user is not the current runner (only seekers can start positioning)
        if (gameState.current_runner_id === user.id) {
            return { error: "Only seekers can start the positioning phase" };
        }

        // Transition to positioning phase
        const updatedState = {
            ...gameState,
            phase: 'positioning',
            positioning_start_time: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("game_state").update(updatedState).eq("game_id", gameId);
        if (error) return { error: "Failed to start positioning: " + error.message };

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
                });
            }

            const { error: handError } = await supabase
                .from("game_state")
                .update({
                    cards_in_hand: newCards,
                })
                .eq("game_id", gameId);

            if (handError) {
                console.error("Failed to update hand:", handError);
            }
        }

        return { success: true };
    } catch (error) {
        console.error("Start positioning error:", error);
        return { error: "An unexpected error occurred" };
    }
}

export async function startRun(gameId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        // Validate that the user is the current runner
        if (gameState.current_runner_id !== user.id) {
            return { error: "Only the current runner can start the run" };
        }

        // Validate that we're in positioning phase
        if (gameState.phase !== 'positioning') {
            return { error: "Run can only be started from positioning phase" };
        }

        // Check if positioning time has elapsed (20 minutes = 1200 seconds)
        if (gameState.positioning_start_time) {
            const positioningStart = new Date(gameState.positioning_start_time).getTime();
            const elapsed = (Date.now() - positioningStart+10000000) / 1000;
            
            if (elapsed < 10) { // Less than 20 minutes
                const remaining = Math.ceil(10 - elapsed);
                return { error: `Positioning phase not complete. ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining.` };
            }
        }

        // Transition to running phase
        const updatedState = {
            ...gameState,
            phase: 'running',
            start_time: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        

        const { error } = await supabase.from("game_state").update(updatedState).eq("game_id", gameId);
        if (error) return { error: "Failed to start run: " + error.message };

        return { success: true };
    } catch (error) {
        console.error("Start run error:", error);
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

        // Can only clear roadblocks during running phase
        if (gameState.phase === 'intermission') {
            return { error: "Roadblocks cannot be cleared during the intermission" };
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

        // Can only clear curses during running phase
        if (gameState.phase === 'intermission') {
            return { error: "Curses cannot be cleared during the intermission" };
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

        // Cards can only be played during running phase
        if (gameState.phase === 'intermission'){
            return { error: "Cards cannot be played during the intermission" };
        }

        // Only seekers can play cards
        if (user.id === gameState.current_runner_id) {
            return { error: "Only seekers can play cards" };
        }

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
                        description: cardToPlay.description
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
                        description: cardToPlay.description
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

        // Can only end run during running phase
        if (gameState.phase !== 'running') {
            return { error: "Run can only be ended during the running phase" };
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

        // Update game state with new runner and enter waiting phase
        const { error: gameStateError } = await supabase
            .from("game_state")
            .update({
                current_runner_id: nextRunnerId,
                phase: 'intermission', // Wait for seekers to start positioning
                positioning_start_time: null, // Clear positioning timer
                runner_points: 0, // Reset points for new runner
                active_effects: [], // Clear active effects
                start_time: null, // Clear run start time
                updated_at: new Date().toISOString(),
                game_log: [gameState.runner_node], // Start new game log with current position
                seeker_node: gameState.runner_node,
                cards_in_hand: [] // Clear cards for transition
            })
            .eq("game_id", gameId);

        if (gameStateError) {
            return { error: "Failed to update game state: " + gameStateError.message };
        }

        return { success: true };
    } catch (error) {
        console.error("End run error:", error);
        return { error: "An unexpected error occurred" };
    }
}