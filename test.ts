// Test: Chip-Version prüfen, dann UID fortlaufend lesen.
// Ausgabe über die GERÄT-Konsole (nicht Simulator) oder ein externes Terminal mit 115200 Baud.

MFRC522.Init(DigitalPin.C4, DigitalPin.C5, DigitalPin.C6, DigitalPin.C7)

const version = MFRC522.getVersion()
serial.writeString("MFRC522 Version: ")
serial.writeNumber(version)
serial.writeLine("")
basic.setLedColor(version == 145 || version == 146 ? 0x0000ff : 0xff0000)
basic.pause(1000)
basic.setLedColor(0x000000)

let busy = false
let lastUid = ""

input.onButtonPressed(Button.A, function () {
    busy = true
    const ok = MFRC522.write("Calliope")
    serial.writeLine(ok ? "write: true" : "write: false")
    busy = false
})

input.onButtonPressed(Button.B, function () {
    busy = true
    serial.writeLine("read: " + MFRC522.read())
    busy = false
})

basic.forever(function () {
    if (!busy) {
        const uid = MFRC522.getUID()
        if (uid != lastUid) {
            if (uid.length > 0) {
                serial.writeLine("Tag: " + uid)
                basic.setLedColor(0x00ff00)
            } else {
                serial.writeLine("Tag entfernt")
                basic.setLedColor(0x000000)
            }
            lastUid = uid
        }
    }
    basic.pause(50)
})
