pxt-rfid-mfrc522-calliope

MakeCode-Erweiterung für den Calliope mini 1.x zur Ansteuerung des MFRC522 RFID-Moduls (z. B. Joy-IT SBC-RFID-RC522) über Hardware-SPI an frei wählbaren Pins.

Fork von joy-it/pxt-rfid-mfrc522 (MIT), angepasst und korrigiert für den Calliope mini.

Status
Punkt	Stand
Hardware-SPI auf C4–C7	verifiziert (VersionReg = 146 auf Calliope mini 1.3)
UID lesen	verifiziert (stabile Erkennung bei liegendem Tag)
Blöcke lesen/schreiben	verifiziert (MIFARE Classic, Standard-Key)
Calliope mini 2/3	nicht getestet
Warum dieser Fork

Die Joy-IT-Erweiterung läuft auf dem Calliope mini nicht zuverlässig. Gründe:

Feste micro:bit-Pins. SPI ist fest auf P13–P16 verdrahtet. Diese Pins sind auf dem Calliope nicht entsprechend herausgeführt.
Warteschleife wartet nicht. In MFRC522_ToCard wird ~ (bitweises NOT) statt ! verwendet. Die Bedingung ist dadurch immer wahr, die Schleife bricht nach dem ersten Durchlauf ab, ohne auf die Antwort des Tags zu warten. Dass es auf dem micro:bit meist trotzdem funktioniert, ist Timing-Zufall.
ID enthält das Prüfbyte. getID() setzt 5 Bytes (4 UID-Bytes + BCC) zu einer Zahl zusammen. Das Ergebnis stimmt nicht mit der UID überein, die andere Reader oder Handy-Apps anzeigen.
Blockierende Funktionen. getID(), read() und write() loopen, bis ein Tag erkannt wird. Ohne Tag hängt das Programm.

Kein Problem ist Hardware-SPI selbst. Der nRF51822 kann sein SPI-Peripheral auf beliebige GPIOs legen, MakeCode stellt das über pins.spiPins() bereit.

Änderungen gegenüber dem Original
Init(cs, sck, mosi, miso): alle vier Pins frei wählbar (Standard C4–C7)
Warteschleife korrigiert
UID aus 4 Bytes, BCC wird geprüft, Ausgabe als Hex-String ("21-C5-1C-1A")
Alle Funktionen nicht blockierend ("", 0 oder false, wenn kein Tag)
WUPA statt REQA mit zweitem Wake-Versuch: liegende Tags werden in jedem Zyklus erkannt, nicht nur in jedem zweiten (ein Tag in READY verwirft das erste Kommando, ISO 14443-3)
Pause nach Soft-Reset, HALT nach Lesen/Schreiben
Timer-Reload-Register korrekt adressiert (Original schrieb auf 0x2E statt 0x2C)
LED-Matrix wird nur abgeschaltet, wenn ein Pin auf C4–C12 liegt
Neu: isTagPresent(), getVersion(), AntennaOn()
Verdrahtung (Standard)
MFRC522	Calliope mini 1.x	MakeCode-Pin
VCC	3,3 V (+)	–
GND	GND (−)	–
RST	3,3 V	–
IRQ	nicht verbunden	–
SDA (CS)	Stiftleiste C4	DigitalPin.C4
SCK	Stiftleiste C5	DigitalPin.C5
MOSI	Stiftleiste C6	DigitalPin.C6
MISO	Stiftleiste C7	DigitalPin.C7

Hinweise

Niemals an 5 V anschließen. Der MFRC522 arbeitet mit 3,3 V.
C4–C12 teilen sich die Leitungen mit der LED-Matrix. Bei diesen Pins wird die Matrix automatisch abgeschaltet. RGB-LED und Sound funktionieren weiter.
Alternative ohne Matrix-Konflikt: die großen Pads P0–P3.
Meiden: C16/C17 (Grove A1, serielle Schnittstelle) und C18/C19 (I2C, Beschleunigungssensor).
API
Funktion	Rückgabe	Beschreibung
Init(cs, sck, mosi, miso)	–	Initialisierung, Antenne an
getUID()	string	UID als Hex, "" wenn kein Tag
getID()	number	UID als Zahl (4 Bytes), 0 wenn kein Tag
isTagPresent()	boolean	Tag im Feld
read()	string	Text aus Blöcken 8–10 (max. 48 Zeichen), "" bei Fehler
write(text)	boolean	Text in Blöcke 8–10, true bei Erfolg
getVersion()	number	145 = v1.0, 146 = v2.0, 0/255 = keine Verbindung
AntennaOff() / AntennaOn()	–	Antenne schalten

read() und write() nutzen MIFARE Classic mit Standard-Key A (FF FF FF FF FF FF), Sektor 2. Karten, die mit der Joy-IT-Erweiterung beschrieben wurden, bleiben lesbar.

Beispiel
typescript
MFRC522.Init(DigitalPin.C4, DigitalPin.C5, DigitalPin.C6, DigitalPin.C7)

const MASTER_TAG = "21-C5-1C-1A"
let lastUid = ""

basic.forever(function () {
    const uid = MFRC522.getUID()
    if (uid.length > 0 && uid != lastUid) {
        serial.writeLine("Tag: " + uid)
        basic.setLedColor(uid == MASTER_TAG ? 0x00ff00 : 0xff0000)
    } else if (uid.length == 0) {
        basic.setLedColor(0x000000)
    }
    lastUid = uid
    basic.pause(50)
})
Debugging
Serielle Ausgabe nur über die Gerät-Konsole lesen. Zeigt MakeCode nur „Daten anzeigen Simulator“, ist das Board nicht per WebUSB verbunden, und alle Werte stammen aus dem Simulator. Alternative: externes Terminal mit 115200 Baud.
Erster Check immer getVersion(). Bei 0 oder 255 stimmt die Verdrahtung oder Versorgung nicht.
Die RGB-LED eignet sich als zweiter, von Serial unabhängiger Anzeigekanal.
Installation
makecode.calliope.cc öffnen
Erweiterungen → Repository-URL eingeben
Kategorie MFRC522 RFID erscheint in der Toolbox
Lizenz

MIT. Basiert auf joy-it/pxt-rfid-mfrc522, Copyright Joy-IT. Die Original-LICENSE-Datei muss im Fork erhalten bleiben.
