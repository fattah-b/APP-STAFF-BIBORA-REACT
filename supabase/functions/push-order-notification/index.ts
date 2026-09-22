// Supabase Edge Function to send high-priority FCM/APNs push notifications on new orders
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || ''

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record // Inserted scans_logs row

    if (!record || !record.restaurant_id) {
      return new Response(JSON.stringify({ message: 'No restaurant_id provided' }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch device tokens for this restaurant
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('restaurant_id', record.restaurant_id)

    if (error || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No registered device tokens found' }), { status: 200 })
    }

    // Send push notification to all registered staff tokens
    const pushPromises = tokens.map(async ({ token }) => {
      return fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `key=${FCM_SERVER_KEY}`
        },
        body: JSON.stringify({
          to: token,
          priority: 'high',
          notification: {
            title: '🍽️ New Order Received',
            body: `New order #${record.id?.slice(0, 6) || ''} arrived.`,
            sound: 'default',
            android_channel_id: 'new_orders_channel'
          },
          android: {
            priority: 'high',
            notification: {
              channel_id: 'new_orders_channel',
              sound: 'default',
              visibility: 'public'
            }
          },
          aps: {
            alert: {
              title: '🍽️ New Order Received',
              body: `New order #${record.id?.slice(0, 6) || ''} arrived.`
            },
            sound: 'default',
            'content-available': 1
          },
          data: {
            order_id: record.id,
            restaurant_id: record.restaurant_id
          }
        })
      })
    })

    await Promise.all(pushPromises)

    return new Response(JSON.stringify({ success: true, count: tokens.length }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
