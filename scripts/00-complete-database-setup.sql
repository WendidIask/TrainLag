-- Complete database setup for multiplayer chase game
-- Run this script to create all tables, policies, and triggers from scratch

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS game_state CASCADE;
DROP TABLE IF EXISTS maps CASCADE;
DROP TABLE IF EXISTS card_sets CASCADE;
DROP TABLE IF EXISTS game_players CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Create profiles table
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create games table
CREATE TABLE games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_players table
CREATE TABLE game_players (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'seeker' CHECK (role IN ('runner', 'seeker')),
    player_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, player_id),
    UNIQUE(game_id, player_order)
);

-- Create card_sets table
CREATE TABLE card_sets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('battle', 'roadblock', 'curse', 'utility')),
    cards JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create maps table
CREATE TABLE maps (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    nodes JSONB NOT NULL DEFAULT '[]',
    edges JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_state table
CREATE TABLE game_state (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE UNIQUE NOT NULL,
    current_runner_id UUID REFERENCES profiles(id),
    current_node TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    total_points INTEGER DEFAULT 0,
    player_hands JSONB DEFAULT '{}',
    active_effects JSONB DEFAULT '[]',
    discard_pile JSONB DEFAULT '[]',
    available_cards JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view profiles of players in their games" ON profiles
    FOR SELECT USING (
        id IN (
            SELECT gp.player_id 
            FROM game_players gp 
            WHERE gp.game_id IN (
                SELECT gp2.game_id 
                FROM game_players gp2 
                WHERE gp2.player_id = auth.uid()
            )
        )
    );

-- Create RLS policies for games
CREATE POLICY "Users can view games they're part of" ON games
    FOR SELECT USING (
        creator_id = auth.uid() OR 
        id IN (SELECT game_id FROM game_players WHERE player_id = auth.uid())
    );

CREATE POLICY "Users can create games" ON games
    FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Game creators can update their games" ON games
    FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "Game creators can delete their games" ON games
    FOR DELETE USING (creator_id = auth.uid());

-- Create RLS policies for game_players
CREATE POLICY "Users can view players in their games" ON game_players
    FOR SELECT USING (
        game_id IN (
            SELECT id FROM games WHERE creator_id = auth.uid()
        ) OR 
        game_id IN (
            SELECT game_id FROM game_players WHERE player_id = auth.uid()
        )
    );

CREATE POLICY "Game creators can manage players" ON game_players
    FOR ALL USING (
        game_id IN (SELECT id FROM games WHERE creator_id = auth.uid())
    );

-- Create RLS policies for card_sets
CREATE POLICY "Users can view card sets in their games" ON card_sets
    FOR SELECT USING (
        game_id IN (
            SELECT id FROM games WHERE creator_id = auth.uid()
        ) OR 
        game_id IN (
            SELECT game_id FROM game_players WHERE player_id = auth.uid()
        )
    );

CREATE POLICY "Game creators can manage card sets" ON card_sets
    FOR ALL USING (
        game_id IN (SELECT id FROM games WHERE creator_id = auth.uid())
    );

-- Create RLS policies for maps
CREATE POLICY "Users can view maps in their games" ON maps
    FOR SELECT USING (
        game_id IN (
            SELECT id FROM games WHERE creator_id = auth.uid()
        ) OR 
        game_id IN (
            SELECT game_id FROM game_players WHERE player_id = auth.uid()
        )
    );

CREATE POLICY "Game creators can manage maps" ON maps
    FOR ALL USING (
        game_id IN (SELECT id FROM games WHERE creator_id = auth.uid())
    );

-- Create RLS policies for game_state
CREATE POLICY "Users can view game state for their games" ON game_state
    FOR SELECT USING (
        game_id IN (
            SELECT id FROM games WHERE creator_id = auth.uid()
        ) OR 
        game_id IN (
            SELECT game_id FROM game_players WHERE player_id = auth.uid()
        )
    );

CREATE POLICY "Users can update game state for their games" ON game_state
    FOR ALL USING (
        game_id IN (
            SELECT id FROM games WHERE creator_id = auth.uid()
        ) OR 
        game_id IN (
            SELECT game_id FROM game_players WHERE player_id = auth.uid()
        )
    );

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, username)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON game_state
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Insert some default data for testing (optional)
-- You can remove this section if you don't want test data

-- Note: The profiles will be created automatically when users sign up
-- Games, players, card sets, maps, and game state will be created through the application

COMMENT ON TABLE profiles IS 'User profiles linked to Supabase Auth users';
COMMENT ON TABLE games IS 'Game instances created by users';
COMMENT ON TABLE game_players IS 'Players participating in each game';
COMMENT ON TABLE card_sets IS 'Card sets uploaded for each game';
COMMENT ON TABLE maps IS 'Maps uploaded for each game';
COMMENT ON TABLE game_state IS 'Current state of active games';
