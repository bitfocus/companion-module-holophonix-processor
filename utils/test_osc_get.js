/*
 Simple OSC /get tester for Holophonix
 Usage: node utils/test_osc_get.js --host 127.0.0.1 --port 4003
*/

import osc from 'osc'

function argVal(a) {
  return a && Object.prototype.hasOwnProperty.call(a, 'value') ? a.value : a
}

function now() {
  return new Date().toISOString()
}

const args = process.argv.slice(2)
let host = '127.0.0.1'
let port = 4003
let listenPort = 0 // 0 = ephemeral; set to fixed to receive on a specific port
let localAddress = '0.0.0.0'
const queries = []
let durationMs = 6000
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) host = args[++i]
  else if (args[i] === '--port' && args[i + 1]) port = Number(args[++i])
  else if ((args[i] === '--q' || args[i] === '--query') && args[i + 1]) queries.push(args[++i])
  else if (args[i] === '--duration' && args[i + 1]) durationMs = Number(args[++i])
  else if ((args[i] === '--listen-port' || args[i] === '--lp') && args[i + 1]) listenPort = Number(args[++i])
  else if (args[i] === '--local' && args[i + 1]) localAddress = args[++i]
}

const udp = new osc.UDPPort({ localAddress, localPort: listenPort, metadata: true })

const received = []
udp.on('ready', () => {
  const lp = udp.options.localPort
  console.log(`[${now()}] UDP ready (local ${localAddress}:${lp}) -> ${host}:${port}`)

  if (queries.length === 0) {
    queries.push('/master/gain', '/stereo/[1-3]/gain', '/track/*/mute')
  }

  // Stagger the sends slightly
  queries.forEach((p, idx) => {
    setTimeout(() => sendGet(p), 100 + idx * 150)
  })

  // Stop after duration
  setTimeout(() => {
    console.log(`[${now()}] Done, closing UDP...`)
    try { udp.close() } catch {}
    summarize()
  }, durationMs)
})

udp.on('message', (msg, timetag, info) => {
  const vals = (msg.args || []).map(argVal)
  console.log(`[${now()}] RECV from ${info?.address}:${info?.port} -> ${msg.address} ${JSON.stringify(vals)}`)
  received.push({ address: msg.address, values: vals, info })
})

udp.on('error', (e) => {
  console.error(`[${now()}] UDP error: ${e?.message}`)
})

udp.open()

function sendGet(path) {
  console.log(`[${now()}] SEND /get ${path}`)
  try {
    // If first segment is a list like {track,stereo}, expand into multiple /get calls
    const m = String(path).match(/^\/\{([^}]+)\}(.*)$/)
    if (m) {
      const items = m[1].split(',').map((s) => s.trim()).filter(Boolean)
      const rest = m[2] || ''
      for (const it of items) {
        const expanded = `/${it}${rest}`
        console.log(`[${now()}]  -> expanded /get ${expanded}`)
        udp.send({ address: '/get', args: [{ type: 's', value: expanded }] }, host, port)
      }
    } else {
      udp.send({ address: '/get', args: [{ type: 's', value: path }] }, host, port)
    }
  } catch (e) {
    console.error(`[${now()}] Send error: ${e?.message}`)
  }
}

function summarize() {
  const byAddr = new Map()
  for (const r of received) {
    if (!byAddr.has(r.address)) byAddr.set(r.address, [])
    byAddr.get(r.address).push(r.values)
  }
  console.log('----- SUMMARY -----')
  if (byAddr.size === 0) {
    console.log('No responses received.')
    return
  }
  for (const [address, valuesList] of byAddr.entries()) {
    const sample = valuesList[0] || []
    console.log(`Address: ${address}\n  Samples: ${valuesList.length}\n  First values: ${JSON.stringify(sample)}`)
  }
  console.log('-------------------')
}
