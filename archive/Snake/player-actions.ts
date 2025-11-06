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

            // Move to the new node
            updatedState.runner_node = newNode;
            
            await checkAndAwardPoints(supabase, gameId, updatedState);

            return { success: true };
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
    const { data } = await supabase.auth.getUser();
    const { user } = data;
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
    const { data } = await supabase.auth.getUser();
    const { user } = data;
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
            const elapsed = (Date.now() - positioningStart) / 1000;
            
            if (elapsed < 1200) { // Less than 20 minutes
                const remaining = Math.ceil(1200 - elapsed);
                return { error: `Positioning phase not complete. ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining.` };
            }
        }

        // Transition to running phase
        const updatedState = {
            ...gameState,
            phase: 'running',
            game_log: [gameState.runner_node],
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
    const { data } = await supabase.auth.getUser();
    const { user } = data;
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

        // Check if all obstacles at current location are now cleared
        await checkAndAwardPoints(supabase, gameId, gameState);

        return { success: true };
    } catch (error) {
        console.error("Clear roadblock error:", error);
        return { error: "An unexpected error occurred" };
    }
}

export async function clearCurse(gameId: string, curseId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
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

        // Check if all obstacles at current location are now cleared
        await checkAndAwardPoints(supabase, gameId, gameState);

        return { success: true };
    } catch (error) {
        console.error("Clear curse error:", error);
        return { error: "An unexpected error occurred" };
    }
}

async function checkAndAwardPoints(supabase: any, gameId: string, gameState: any) {
    const { data: map } = await supabase.from("maps").select("*").eq("game_id", gameId);
    if (!map) return { error: "Game not found" };

    const currentNode = gameState.runner_node;
    console.log(gameState.runner_node, gameState.game_log)
    if (!currentNode) return;

    // Check if this node is already in the game_log (meaning points were already awarded)
    const gameLog = gameState.game_log || [];
    if (gameLog.includes(currentNode)) {
        return; // Points already awarded for this node
    }

    // Check for remaining roadblocks at current location
    const { data: remainingRoadblocks } = await supabase
        .from("roadblocks")
        .select("*")
        .eq("game_id", gameId)
        .eq("node_name", currentNode);

    // Check for remaining curses affecting paths to/from current location
    const previousNode = gameLog.length >= 1 ? gameLog[gameLog.length - 1] : null;
    
    let remainingCurses = [];
    if (previousNode) {
        const { data: cursesData } = await supabase
            .from("curses")
            .select("*")
            .eq("game_id", gameId)
            .or(`and(start_node.eq.${previousNode},end_node.eq.${currentNode}),and(start_node.eq.${currentNode},end_node.eq.${previousNode})`);
        
        remainingCurses = cursesData || [];
    }

    console.log("CHECK", remainingRoadblocks, remainingCurses);

    const hasRemainingObstacles = (remainingRoadblocks && remainingRoadblocks.length > 0) || 
                                 (remainingCurses && remainingCurses.length > 0);

    console.log(hasRemainingObstacles)
    // If no obstacles remain, award points and add to game_log
    if (!hasRemainingObstacles) {
        const mapInfo = map?.[0];
        const path = mapInfo.edges.find((edge: any) => 
            edge.from === gameState.game_log[gameState.game_log.length-1] && edge.to === gameState.runner_node
        );
        console.log(path)

        gameState.runner_points = (gameState.runner_points || 0)+path.points;
        const gameLog = gameState.game_log || [];
        gameState.game_log = [...gameLog, gameState.runner_node];
        
        const { error: pointsError } = await supabase
            .from("game_state")
            .update(gameState)
            .eq("game_id", gameId);
        
        if (pointsError) {
            console.error("Error updating points");
        }
    }
}

export async function playCard(gameId: string, cardId: string, targetPlayer?: string, targetNode?: string, targetNode2?: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
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
                const { error: challengeError } = await supabase
                    .from("battlechallenge")
                    .insert({
                        game_id: gameId,
                        node_name: gameState.seeker_node,
                        placed_by: user.id,
                        description: cardToPlay.description
                    });
                    
                if (challengeError) {
                    return { error: "Failed to place challenge: " + challengeError.message };
                }
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
                // Handle specific utility card effects based on card name
                switch (cardToPlay.name) {
                    case "Faithless Looting":
                        // Draw two cards, then discard two cards
                        const { data: availableCards1 } = await supabase
                            .from("cards")
                            .select("*")
                            .eq("game_id", gameId);

                        if (availableCards1 && availableCards1.length > 0) {
                            const newCards = [];
                            for (let i = 0; i < 2; i++) {
                                const randomCard = availableCards1[Math.floor(Math.random() * availableCards1.length)];
                                newCards.push({
                                    id: `${randomCard.id}_${Date.now()}_${i}_${Math.random()}`,
                                    name: randomCard.name,
                                    type: randomCard.type,
                                    description: randomCard.description,
                                });
                            }
                            updatedState.cards_in_hand = [...updatedHand, ...newCards];
                        }
                        
                        // Add effect to force discarding 2 cards on next turn
                        activeEffects.push({
                            type: "discard_two",
                            description: "Must discard two cards"
                        });
                        break;

                    case "Misdirection":
                        // When placing your next roadblock, you may mark the position as an adjacent node instead
                        activeEffects.push({
                            type: "misdirection",
                            description: "Next roadblock can be placed on an adjacent node"
                        });
                        break;

                    case "See Double":
                        // The next curse you cast can target two separate paths
                        activeEffects.push({
                            type: "see_double",
                            description: "Next curse can target two separate paths"
                        });
                        break;

                    case "Wheel of Fortune":
                        // Discard your hand and draw three cards
                        const { data: availableCards2 } = await supabase
                            .from("cards")
                            .select("*")
                            .eq("game_id", gameId);

                        if (availableCards2 && availableCards2.length > 0) {
                            const newCards = [];
                            for (let i = 0; i < 3; i++) {
                                const randomCard = availableCards2[Math.floor(Math.random() * availableCards2.length)];
                                newCards.push({
                                    id: `${randomCard.id}_${Date.now()}_${i}_${Math.random()}`,
                                    name: randomCard.name,
                                    type: randomCard.type,
                                    description: randomCard.description,
                                });
                            }
                            // Replace entire hand with 3 new cards
                            updatedState.cards_in_hand = newCards;
                        }
                        break;

                    case "Yarus, Roar of the Old Gods":
                        // You may place your next roadblock without informing the runner of its location
                        activeEffects.push({
                            type: "hidden_roadblock",
                            description: "Next roadblock placement is hidden from runner"
                        });
                        break;

                    case "Gamble":
                        // Search the deck for a card that you would like, then discard a card at random
                        const { data: availableCards3 } = await supabase
                            .from("cards")
                            .select("*")
                            .eq("game_id", gameId);

                        if (availableCards3 && availableCards3.length > 0 && updatedHand.length > 0) {
                            // For now, randomly select a card from deck (in real implementation, player would choose)
                            const chosenCard = availableCards3[Math.floor(Math.random() * availableCards3.length)];
                            const newCard = {
                                id: `${chosenCard.id}_${Date.now()}_${Math.random()}`,
                                name: chosenCard.name,
                                type: chosenCard.type,
                                description: chosenCard.description,
                            };
                            
                            // Remove a random card from hand and add the chosen card
                            const randomIndex = Math.floor(Math.random() * updatedHand.length);
                            const newHand = [...updatedHand];
                            newHand.splice(randomIndex, 1);
                            newHand.push(newCard);
                            updatedState.cards_in_hand = newHand;
                        }
                        break;

                    case "Goblin Charbelcher":
                        // The next roadblock or curse that you play can be placed anywhere
                        activeEffects.push({
                            type: "global_placement",
                            description: "Next roadblock or curse can be placed anywhere on the map"
                        });
                        break;

                    default:
                        // Default utility behavior - draw 2 cards
                        const { data: availableCardsDefault } = await supabase
                            .from("cards")
                            .select("*")
                            .eq("game_id", gameId);

                        if (availableCardsDefault && availableCardsDefault.length > 0) {
                            const newCards = [];
                            for (let i = 0; i < 2; i++) {
                                const randomCard = availableCardsDefault[Math.floor(Math.random() * availableCardsDefault.length)];
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

// Enhanced roadblock placement with utility card effects
export async function placeRoadblockWithEffects(gameId: string, nodeId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        const { data: map } = await supabase.from("maps").select("*").eq("game_id", gameId);
        if (!gameState || !map) return { error: "Game not found" };

        const activeEffects = gameState.active_effects || [];
        
        let placementNode = nodeId;
        let isHidden = false;
        
        // Check for active effects
        const misdirectionEffect = activeEffects.find((effect: any) => effect.type === "misdirection");
        const globalPlacementEffect = activeEffects.find((effect: any) => effect.type === "global_placement");
        const hiddenRoadblockEffect = activeEffects.find((effect: any) => effect.type === "hidden_roadblock");
        
        // Validate placement based on effects
        if (globalPlacementEffect) {
            // Can place anywhere - no validation needed
        } else if (misdirectionEffect) {
            // Can place on adjacent nodes to seeker's position
            const mapInfo = map?.[0];
            const adjacentNodes = mapInfo?.edges?.filter((edge: any) => 
                edge.from.toLowerCase() === gameState.seeker_node?.toLowerCase()
            )?.map((edge: any) => edge.to) || [];
            
            if (!adjacentNodes.includes(nodeId) && nodeId !== gameState.seeker_node) {
                return { error: "With Misdirection, you can only place roadblocks on your current node or adjacent nodes" };
            }
        } else {
            // Normal placement - must be on seeker's current node
            if (nodeId !== gameState.seeker_node) {
                return { error: "You can only place roadblocks on your current node" };
            }
        }
        
        // Check if placement should be hidden
        if (hiddenRoadblockEffect) {
            isHidden = true;
        }

        const { error: roadblockError } = await supabase
            .from("roadblocks")
            .insert({
                game_id: gameId,
                node_name: placementNode,
                placed_by: user.id,
                is_hidden: isHidden,
                description: "Roadblock"
            });
            
        if (roadblockError) {
            return { error: "Failed to place roadblock: " + roadblockError.message };
        }

        // Remove used effects
        const updatedEffects = activeEffects.filter((effect: any) => 
              (effect.type === "misdirection" || 
               effect.type === "global_placement" || 
               effect.type === "hidden_roadblock")
        );

        const { error: effectError } = await supabase
            .from("game_state")
            .update({ active_effects: updatedEffects })
            .eq("game_id", gameId);

        if (effectError) {
            console.error("Failed to update effects:", effectError);
        }

        return { success: true };
    } catch (error) {
        console.error("Place roadblock error:", error);
        return { error: "An unexpected error occurred" };
    }
}

// Enhanced curse placement with utility card effects
export async function placeCurseWithEffects(gameId: string, targetNode: string, targetNode2?: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        const { data: map } = await supabase.from("maps").select("*").eq("game_id", gameId);
        if (!gameState || !map) return { error: "Game not found" };

        const activeEffects = gameState.active_effects || [];
        
        // Check for active effects
        const seeDoubleEffect = activeEffects.find((effect: any) => effect.type === "see_double");
        const globalPlacementEffect = activeEffects.find((effect: any) => effect.type === "global_placement");
        
        const mapInfo = map?.[0];
        const adjacentNodes = mapInfo?.edges?.filter((edge: any) => 
            edge.from.toLowerCase() === gameState.seeker_node?.toLowerCase()
        )?.map((edge: any) => edge.to) || [];

        // Validate first target
        if (!globalPlacementEffect && !adjacentNodes.some((node: string) => node.toLowerCase() === targetNode.toLowerCase())) {
            return { error: "You can only curse paths to adjacent nodes" };
        }

        // Place first curse
        const { error: curseError1 } = await supabase
            .from("curses")
            .insert({
                game_id: gameId,
                start_node: gameState.seeker_node,
                end_node: targetNode,
                description: "Curse"
            });
            
        if (curseError1) {
            return { error: "Failed to place curse: " + curseError1.message };
        }

        // Place second curse if See Double is active and target provided
        if (seeDoubleEffect && targetNode2) {
            if (!globalPlacementEffect && !adjacentNodes.some((node: string) => node.toLowerCase() === targetNode2.toLowerCase())) {
                return { error: "Second curse target must also be adjacent (unless using global placement)" };
            }

            const { error: curseError2 } = await supabase
                .from("curses")
                .insert({
                    game_id: gameId,
                    start_node: gameState.seeker_node,
                    end_node: targetNode2,
                    description: "Curse (See Double)"
                });
                
            if (curseError2) {
                console.error("Failed to place second curse:", curseError2);
                // Don't fail the whole operation if second curse fails
            }
        }

        // Remove used effects
        const updatedEffects = activeEffects.filter((effect: any) => 
            (effect.type === "see_double" || effect.type === "global_placement")
        );

        const { error: effectError } = await supabase
            .from("game_state")
            .update({ active_effects: updatedEffects })
            .eq("game_id", gameId);

        if (effectError) {
            console.error("Failed to update effects:", effectError);
        }

        return { success: true };
    } catch (error) {
        console.error("Place curse error:", error);
        return { error: "An unexpected error occurred" };
    }
}

// Function to handle forced discard from Faithless Looting
export async function discardCards(gameId: string, cardIds: string[]) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        const playerHand = gameState.cards_in_hand || [];
        const activeEffects = gameState.active_effects || [];
        
        // Check if player has discard effect active
        const discardEffect = activeEffects.find((effect: any) => 
            effect.type === "discard_two"
        );
        
        if (!discardEffect) {
            return { error: "No discard effect active" };
        }

        if (cardIds.length !== 2) {
            return { error: "You must discard exactly 2 cards" };
        }

        // Validate cards are in hand
        for (const cardId of cardIds) {
            if (!playerHand.find((card: any) => card.id === cardId)) {
                return { error: "One or more cards not found in your hand" };
            }
        }

        // Remove cards from hand
        const updatedHand = playerHand.filter((card: any) => !cardIds.includes(card.id));
        
        // Add to discard pile
        const discardPile = gameState.discard_pile || [];
        const cardsToDiscard = playerHand.filter((card: any) => cardIds.includes(card.id));
        discardPile.push(...cardsToDiscard.map((card: any) => ({
            ...card,
            discardedBy: user.id,
            discardedAt: new Date().toISOString(),
        })));

        // Remove discard effect
        const updatedEffects = activeEffects.filter((effect: any) => 
            effect.type === "discard_two"
        );

        const { error } = await supabase
            .from("game_state")
            .update({
                cards_in_hand: updatedHand,
                discard_pile: discardPile,
                active_effects: updatedEffects,
                updated_at: new Date().toISOString(),
            })
            .eq("game_id", gameId);

        if (error) {
            return { error: "Failed to discard cards: " + error.message };
        }

        return { success: true };
    } catch (error) {
        console.error("Discard cards error:", error);
        return { error: "An unexpected error occurred" };
    }
}

// Function to check if player has pending actions (like forced discard)
export async function getPendingActions(gameId: string) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const { user } = data;
    if (!user) return { error: "You must be logged in" };

    try {
        const { data: gameState } = await supabase.from("game_state").select("*").eq("game_id", gameId).single();
        if (!gameState) return { error: "Game state not found" };

        const activeEffects = gameState.active_effects || [];
        
        const pendingActions = activeEffects.map((effect: any) => ({
            type: effect.type,
            description: effect.description,
            required: effect.type === "discard_two" // Some effects are mandatory
        }));

        return { success: true, pendingActions };
    } catch (error) {
        console.error("Get pending actions error:", error);
        return { error: "An unexpected error occurred" };
    }
}

export async function endRun(gameId: string) {
    const supabase = await createServerClient();
    
    const { data } = await supabase.auth.getUser();
    const { user } = data;
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
                game_log: [], // Start new game log with current position
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