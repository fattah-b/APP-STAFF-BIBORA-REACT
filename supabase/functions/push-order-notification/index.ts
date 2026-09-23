// Supabase Edge Function to send high-priority FCM v1 / APNs push notifications on new orders
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || ''

function urlB64Encode(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  }

  const unsignedToken = `${urlB64Encode(JSON.stringify(header))}.${urlB64Encode(JSON.stringify(payload))}`
  
  const pemHeader = "-----BEGIN PRIVATE KEY-----"
  const pemFooter = "-----END PRIVATE KEY-----"
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "")
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  )

  const b64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const jwt = `${unsignedToken}.${b64Signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  const data = await response.json()
  return data.access_token
}

serve(async (req) => {
  try {
    const payload = await req.json()
    console.log('Incoming Payload:', JSON.stringify(payload))

    // Handle standard webhook payload (record), database trigger (record), or direct object
    const record = payload.record || payload.record_new || payload.new || payload

    if (!record || !record.restaurant_id) {
      return new Response(JSON.stringify({ message: 'No restaurant_id provided', payloadReceived: payload }), { status: 400 })
    }


    const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL') || ''
    const privateKey = (Deno.env.get('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'bibora-staff-app'

    if (!clientEmail || !privateKey) {
      return new Response(JSON.stringify({ error: 'FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY secret is missing' }), { status: 500 })
    }

    const serviceAccount = {
      client_email: clientEmail,
      private_key: privateKey,
      project_id: projectId
    }
    const accessToken = await getAccessToken(serviceAccount)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


    // Fetch device tokens for this restaurant
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('restaurant_id', record.restaurant_id)

    if (error || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No registered device tokens found' }), { status: 200 })
    }

    // Send push notification via FCM v1 API with immediate TTL and high priority
    const pushPromises = tokens.map(async ({ token }) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: '🍽️ New Order Received',
              body: `New order #${record.id?.slice(0, 6) || ''} arrived.`
            },
            android: {
              priority: 'HIGH',
              ttl: '0s',
              notification: {
                channel_id: 'new_orders_channel',
                sound: 'default',
                notification_priority: 'PRIORITY_HIGH',
                visibility: 'PUBLIC',
                default_vibrate_timings: true,
                default_sound_timings: true
              }
            },
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert'
              },
              payload: {
                aps: {
                  alert: {
                    title: '🍽️ New Order Received',
                    body: `New order #${record.id?.slice(0, 6) || ''} arrived.`
                  },
                  sound: 'default',
                  badge: 1,
                  'content-available': 1
                }
              }
            },
            data: {
              order_id: String(record.id),
              restaurant_id: String(record.restaurant_id)
            }
          }
        })
      })
      const resData = await res.json()
      console.log('FCM Send Response:', JSON.stringify(resData))
      return resData
    })

    const results = await Promise.all(pushPromises)

    return new Response(JSON.stringify({ success: true, count: tokens.length, results }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})



