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

let lastUid = ""
basic.forever(function () {
    const uid = MFRC522.getUID()
    if (uid != lastUid) {
        if (uid.length > 0) {
            serial.writeString("Tag: ")
            serial.writeLine(uid)
            basic.setLedColor(0x00ff00)
        } else {
            serial.writeLine("Tag entfernt")
            basic.setLedColor(0x000000)
        }
        lastUid = uid
    }
    basic.pause(50)
})
