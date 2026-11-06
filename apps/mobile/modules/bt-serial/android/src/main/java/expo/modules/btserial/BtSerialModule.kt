package expo.modules.btserial

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * Classic Bluetooth serial (SPP / RFCOMM) for the ESP32 band sketch that uses
 * Arduino's BluetoothSerial. The band speaks newline-terminated text, so this
 * module only moves lines: every received line is sent to JavaScript as an
 * "onLine" event, and write() sends text. The protocol lives in TypeScript
 * (src/ble/serial-band.ts).
 */
@SuppressLint("MissingPermission") // the app asks for BLUETOOTH_SCAN / BLUETOOTH_CONNECT before calling in
class BtSerialModule : Module() {
  private companion object {
    /** `adb logcat -s BtSerial` shows every connect attempt and drop. */
    const val TAG = "BtSerial"
    /** Rounds of (secure, insecure, channel 1). The ESP32 often refuses the first try after a drop. */
    const val ROUNDS = 2
  }

  private val spp: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  private class Link(val socket: BluetoothSocket) {
    @Volatile var closing = false
  }

  private val links = ConcurrentHashMap<String, Link>()
  private var discoveryReceiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  override fun definition() = ModuleDefinition {
    Name("BtSerial")

    Events("onDeviceFound", "onDiscoveryFinished", "onLine", "onDisconnected")

    Function("isAvailable") { adapter != null }

    Function("isEnabled") { adapter?.isEnabled == true }

    /** Devices already paired in Android's Bluetooth settings. */
    Function("bondedDevices") {
      try {
        adapter?.bondedDevices?.map { mapOf("address" to it.address, "name" to (it.name ?: "")) } ?: emptyList()
      } catch (e: SecurityException) {
        emptyList<Map<String, String>>()
      }
    }

    /** Starts a Classic inquiry (about 12 s). Results arrive as onDeviceFound, then onDiscoveryFinished. */
    Function("startDiscovery") {
      val bt = adapter ?: return@Function false
      stopDiscoveryReceiver()
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          when (intent.action) {
            BluetoothDevice.ACTION_FOUND -> {
              val device = deviceFrom(intent) ?: return
              val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE)
              val name = try { device.name } catch (e: SecurityException) { null }
              sendEvent(
                "onDeviceFound",
                mapOf(
                  "address" to device.address,
                  "name" to (name ?: ""),
                  "rssi" to if (rssi == Short.MIN_VALUE) null else rssi.toInt(),
                ),
              )
            }
            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
              stopDiscoveryReceiver()
              sendEvent("onDiscoveryFinished", emptyMap<String, Any>())
            }
          }
        }
      }
      val filter = IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_FOUND)
        addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
      }
      if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
      discoveryReceiver = receiver
      try {
        if (bt.isDiscovering) bt.cancelDiscovery()
        bt.startDiscovery()
      } catch (e: SecurityException) {
        stopDiscoveryReceiver()
        false
      }
    }

    Function("cancelDiscovery") {
      try { adapter?.cancelDiscovery() } catch (_: SecurityException) {}
      stopDiscoveryReceiver()
    }

    /**
     * Opens the serial link. Android shows its own pairing prompt the first
     * time if the band is not paired yet.
     */
    AsyncFunction("connect") { address: String, promise: Promise ->
      val bt = adapter
      if (bt == null) {
        promise.reject("ERR_NO_BLUETOOTH", "This phone has no Bluetooth", null)
        return@AsyncFunction
      }
      if (!bt.isEnabled) {
        promise.reject("ERR_BLUETOOTH_OFF", "Bluetooth is off", null)
        return@AsyncFunction
      }
      thread(name = "bt-serial-connect") {
        try {
          links.remove(address)?.let { close(it) }
          // discovery slows RFCOMM connects down a lot, and often makes them fail
          try { bt.cancelDiscovery() } catch (_: SecurityException) {}
          stopDiscoveryReceiver()
          val device = bt.getRemoteDevice(address)
          Log.i(TAG, "connect $address bond=${device.bondState}")
          val socket = openSocket(device)
          val link = Link(socket)
          links[address] = link
          startReader(address, link)
          Log.i(TAG, "connected $address")
          promise.resolve(null)
        } catch (e: SecurityException) {
          Log.w(TAG, "connect $address: no Bluetooth permission", e)
          promise.reject("ERR_PERMISSION", "Nearby devices (Bluetooth) permission is off", e)
        } catch (e: Exception) {
          Log.w(TAG, "connect $address failed: ${e.message}", e)
          promise.reject("ERR_CONNECT", e.message ?: "Could not connect", e)
        }
      }
    }

    AsyncFunction("write") { address: String, text: String ->
      val link = links[address] ?: throw IOException("Not connected")
      try {
        link.socket.outputStream.write(text.toByteArray(Charsets.UTF_8))
        link.socket.outputStream.flush()
      } catch (e: IOException) {
        drop(address, link)
        throw e
      }
    }

    Function("isConnected") { address: String -> links[address]?.socket?.isConnected == true }

    Function("disconnect") { address: String ->
      links.remove(address)?.let {
        Log.i(TAG, "disconnect $address")
        close(it)
      }
    }

    OnDestroy {
      stopDiscoveryReceiver()
      links.values.forEach { close(it) }
      links.clear()
    }
  }

  private fun deviceFrom(intent: Intent): BluetoothDevice? =
    if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }

  /** Secure SPP first, then insecure, then RFCOMM channel 1 (what ESP32 BluetoothSerial listens on). */
  private fun openSocket(device: BluetoothDevice): BluetoothSocket {
    val attempts: List<() -> BluetoothSocket> = listOf(
      { device.createRfcommSocketToServiceRecord(spp) },
      { device.createInsecureRfcommSocketToServiceRecord(spp) },
      {
        device.javaClass
          .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          .invoke(device, 1) as BluetoothSocket
      },
    )
    val names = listOf("secure", "insecure", "channel 1")
    var last: Exception? = null
    for (round in 1..ROUNDS) {
      for ((i, make) in attempts.withIndex()) {
        var socket: BluetoothSocket? = null
        try {
          socket = make()
          socket.connect()
          Log.i(TAG, "${device.address}: ${names[i]} socket open (round $round)")
          return socket
        } catch (e: Exception) {
          last = e
          Log.w(TAG, "${device.address}: ${names[i]} socket failed (round $round): ${e.message}")
          try { socket?.close() } catch (_: IOException) {}
        }
      }
      if (round < ROUNDS) Thread.sleep(800)
    }
    throw last ?: IOException("Could not connect")
  }

  private fun startReader(address: String, link: Link) {
    thread(name = "bt-serial-read") {
      val buffer = ByteArray(1024)
      val line = ByteArrayOutputStream()
      try {
        val input = link.socket.inputStream
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          for (i in 0 until n) {
            val b = buffer[i]
            if (b == '\n'.code.toByte()) {
              val text = line.toString(Charsets.UTF_8.name()).trimEnd('\r')
              line.reset()
              if (text.isNotEmpty()) sendEvent("onLine", mapOf("address" to address, "line" to text))
            } else if (line.size() < 4096) {
              line.write(b.toInt())
            }
          }
        }
      } catch (e: IOException) {
        if (!link.closing) Log.i(TAG, "$address link dropped: ${e.message}")
      }
      drop(address, link)
    }
  }

  private fun drop(address: String, link: Link) {
    if (links[address] === link) links.remove(address)
    val wasClosing = link.closing
    close(link)
    if (!wasClosing) sendEvent("onDisconnected", mapOf("address" to address))
  }

  private fun close(link: Link) {
    link.closing = true
    try { link.socket.close() } catch (_: IOException) {}
  }

  private fun stopDiscoveryReceiver() {
    discoveryReceiver?.let {
      try { context.unregisterReceiver(it) } catch (_: Exception) {}
    }
    discoveryReceiver = null
  }
}
