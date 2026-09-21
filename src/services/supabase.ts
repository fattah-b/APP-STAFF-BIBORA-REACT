import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ezunddzzmcibnwnvlzng.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dW5kZHp6bWNpYm53bnZsem5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzYwMTgsImV4cCI6MjA5NDk1MjAxOH0.I-rWo3Q0STcG2J1phm3174nn7C7lCS8aHXJyNKJxqwc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface RecognizedItem {
  name: string;
  price: number;
}

export interface OrderLog {
  id: string;
  restaurant_id: string;
  kiosk_id: string | null;
  scanned_image_url: string;
  detected_items: RecognizedItem[];
  edited_detected_items: RecognizedItem[] | null;
  final_items: RecognizedItem[];
  total_price: number;
  created_at: string;
  payment_status: 'pending' | 'accepted' | 'completed' | 'ready' | string;
  staff_status: string | null;
  is_overridden: boolean;
  order_ref: string;
  makan_mana: string;
  order_type: string;
  table_number: string | null;
}

export interface AuthResult {
  token: string;
  restaurantId?: string | null;
  role?: string | null;
}

export async function signInToSupabase(email: string, PIN: string): Promise<AuthResult> {
  // 1. Try standard Supabase Auth if input looks like an email
  if (email.includes('@')) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: PIN,
      });

      if (!error && data.session && data.user) {
        return {
          token: data.session.access_token,
          restaurantId: data.user.user_metadata?.restaurant_id || null,
          role: data.user.user_metadata?.role || null,
        };
      }
    } catch (e) {
      console.warn("Standard Supabase Auth failed, trying staff RPC fallback...", e);
    }
  }

  // 2. Try the custom verify_staff_account RPC function
  const { data: staffData, error: staffError } = await supabase.rpc('verify_staff_account', {
    p_username: email,
    p_password: PIN,
  });

  if (staffError) {
    throw new Error(staffError.message || "Invalid login credentials");
  }

  // verify_staff_account returns a table where we can inspect is_valid and retrieve details
  if (staffData && staffData.length > 0) {
    const staff = staffData[0];
    if (staff.is_valid) {
      return {
        token: 'staff-session',
        restaurantId: staff.restaurant_id || null,
        role: staff.role || 'staff',
      };
    }
  }

  throw new Error("Invalid login credentials");
}

export interface RestaurantProfile {
  id: string;
  name: string;
  theme_mode: string;
}

export async function fetchRestaurantProfile(params: { email?: string; id?: string }): Promise<RestaurantProfile> {
  let query = supabase
    .from('restaurant_profiles')
    .select('id, name, theme_mode');

  if (params.id) {
    query = query.eq('id', params.id);
  } else if (params.email) {
    query = query.eq('owner_email', params.email);
  } else {
    throw new Error("Either profile ID or email must be provided to fetch profile.");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("No restaurant profile associated with this account.");
  }

  return data as RestaurantProfile;
}

// Fetch orders for a restaurant
export async function fetchRestaurantOrders(restaurantId: string): Promise<OrderLog[]> {
  const { data, error } = await supabase
    .from('scans_logs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as OrderLog[];
}

// Update order status
export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('scans_logs')
    .update({ payment_status: status })
    .eq('id', orderId);

  if (error) {
    throw error;
  }
}

// Update staff kitchen status
export async function updateOrderStaffStatus(orderId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('scans_logs')
    .update({ staff_status: status })
    .eq('id', orderId);

  if (error) {
    throw error;
  }
}

// Mark pending order as paid and immediately completed/ready
export async function markPendingOrderAsPaid(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('scans_logs')
    .update({ 
      payment_status: 'completed', 
      staff_status: 'ready' 
    })
    .eq('id', orderId);

  if (error) {
    throw error;
  }
}

export interface MenuItem {
  name: string;
  category?: string | null;
  subcategory?: string | null;
}

export async function fetchMenuItems(restaurantId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('name, category, subcategory')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (error) {
    throw error;
  }

  return (data || []) as MenuItem[];
}

export interface KitchenConfig {
  category: string;
  requires_preparation: boolean;
}

export async function fetchKitchenConfigurations(restaurantId: string): Promise<KitchenConfig[]> {
  const { data, error } = await supabase
    .from('kitchen_configurations')
    .select('category, requires_preparation')
    .eq('restaurant_id', restaurantId);

  if (error) {
    throw error;
  }

  return (data || []) as KitchenConfig[];
}

export async function registerDeviceToken(restaurantId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('device_tokens')
    .upsert({
      restaurant_id: restaurantId,
      token: token,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'token'
    });

  if (error) {
    console.error("Failed to register device token to DB:", error);
    throw error;
  }
}

