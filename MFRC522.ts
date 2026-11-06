/**
 * MFRC522 RFID – Calliope mini Fork
 *
 * Fork von joy-it/pxt-rfid-mfrc522 (MIT License, Copyright Joy-IT).
 * Änderungen gegenüber dem Original:
 *  - SPI-Pins und CS frei wählbar (Hardware-SPI, statt fest P13–P16)
 *  - Warteschleife in toCard korrigiert (Original nutzte ~ statt !, wartete nie)
 *  - UID aus 4 Bytes ohne BCC-Prüfbyte, als Hex-String
 *  - Alle Lesefunktionen nicht blockierend (leerer Wert, wenn kein Tag)
 *  - WUPA statt REQA (zuverlässige Erkennung bei liegendem Tag)
 *  - Pause nach Soft-Reset, HALT nach Lesen/Schreiben
 *  - LED-Matrix wird nur abgeschaltet, wenn ein Pin auf C4–C12 liegt
 */

//% color="#275C6B" weight=100 icon="\uf2bb" block="MFRC522 RFID"
namespace MFRC522 {

    // ---------- Register ----------
    const CommandReg = 0x01
    const ComIEnReg = 0x02
    const ComIrqReg = 0x04
    const DivIrqReg = 0x05
    const ErrorReg = 0x06
    const Status2Reg = 0x08
    const FIFODataReg = 0x09
    const FIFOLevelReg = 0x0A
    const ControlReg = 0x0C
    const BitFramingReg = 0x0D
    const ModeReg = 0x11
    const TxControlReg = 0x14
    const TxASKReg = 0x15
    const CRCResultRegH = 0x21
    const CRCResultRegL = 0x22
    const TModeReg = 0x2A
    const TPrescalerReg = 0x2B
    const TReloadRegH = 0x2C
    const TReloadRegL = 0x2D
    const VersionReg = 0x37

    // ---------- PCD-Kommandos ----------
    const PCD_IDLE = 0x00
    const PCD_CALCCRC = 0x03
    const PCD_TRANSCEIVE = 0x0C
    const PCD_AUTHENT = 0x0E
    const PCD_SOFTRESET = 0x0F

    // ---------- PICC-Kommandos ----------
    const PICC_WUPA = 0x52
    const PICC_ANTICOLL_CL1 = 0x93
    const PICC_AUTHENT1A = 0x60
    const PICC_READ = 0x30
    const PICC_WRITE = 0xA0
    const PICC_HALT = 0x50

    // ---------- Status ----------
    const STATUS_OK = 0
    const STATUS_NOTAG = 1
    const STATUS_ERR = 2

    // Datenblöcke wie im Joy-IT-Original (Sektor 2), damit beschriebene Karten kompatibel bleiben
    const DATA_BLOCKS = [8, 9, 10]
    const AUTH_BLOCK = 11
    const KEY_A = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]

    let csPin = DigitalPin.C4
    let lastStatus = STATUS_ERR
    let lastBits = 0

    // ---------- SPI ----------

    function writeReg(reg: number, val: number): void {
        pins.digitalWritePin(csPin, 0)
        pins.spiWrite((reg << 1) & 0x7E)
        pins.spiWrite(val)
        pins.digitalWritePin(csPin, 1)
    }

    function readReg(reg: number): number {
        pins.digitalWritePin(csPin, 0)
        pins.spiWrite(((reg << 1) & 0x7E) | 0x80)
        const v = pins.spiWrite(0)
        pins.digitalWritePin(csPin, 1)
        return v
    }

    function setBits(reg: number, mask: number): void {
        writeReg(reg, readReg(reg) | mask)
    }

    function clearBits(reg: number, mask: number): void {
        writeReg(reg, readReg(reg) & (~mask))
    }

    // ---------- Kommunikation mit dem Tag ----------

    /**
     * Sendet Daten an den Tag und liefert die Antwort.
     * Setzt lastStatus und lastBits.
     */
    function toCard(command: number, sendData: number[]): number[] {
        const back: number[] = []
        let irqEn = 0x00
        let waitIrq = 0x00
        if (command == PCD_AUTHENT) {
            irqEn = 0x12
            waitIrq = 0x10
        } else if (command == PCD_TRANSCEIVE) {
            irqEn = 0x77
            waitIrq = 0x30
        }

        writeReg(ComIEnReg, irqEn | 0x80)
        writeReg(ComIrqReg, 0x7F)          // alle IRQ-Bits löschen
        setBits(FIFOLevelReg, 0x80)        // FIFO leeren
        writeReg(CommandReg, PCD_IDLE)

        for (let i = 0; i < sendData.length; i++) {
            writeReg(FIFODataReg, sendData[i])
        }
        writeReg(CommandReg, command)
        if (command == PCD_TRANSCEIVE) {
            setBits(BitFramingReg, 0x80)   // StartSend
        }

        // Warten auf Antwort (waitIrq) oder Timer-Timeout (0x01).
        // Fix gegenüber Original: dort ~ statt !, die Schleife brach sofort ab.
        let n = 0
        let i = 2000
        while (i > 0) {
            n = readReg(ComIrqReg)
            if (n & waitIrq) break
            if (n & 0x01) break
            i--
        }
        clearBits(BitFramingReg, 0x80)

        lastBits = 0
        if (i == 0) {
            lastStatus = STATUS_ERR
            return back
        }
        if (readReg(ErrorReg) & 0x1B) {      // BufferOvfl, CollErr, ParityErr, ProtocolErr
            lastStatus = STATUS_ERR
            return back
        }
        if ((n & irqEn & 0x01) && !(n & waitIrq)) {
            lastStatus = STATUS_NOTAG        // Timer abgelaufen, keine Antwort
            return back
        }

        lastStatus = STATUS_OK
        if (command == PCD_TRANSCEIVE) {
            let count = readReg(FIFOLevelReg)
            const rxLast = readReg(ControlReg) & 0x07
            lastBits = rxLast != 0 ? (count - 1) * 8 + rxLast : count * 8
            if (count > 64) count = 64
            for (let j = 0; j < count; j++) {
                back.push(readReg(FIFODataReg))
            }
        }
        return back
    }

    function calcCRC(data: number[]): number[] {
        writeReg(CommandReg, PCD_IDLE)
        clearBits(DivIrqReg, 0x04)
        setBits(FIFOLevelReg, 0x80)
        for (let i = 0; i < data.length; i++) {
            writeReg(FIFODataReg, data[i])
        }
        writeReg(CommandReg, PCD_CALCCRC)
        let t = 255
        while (t > 0) {
            if (readReg(DivIrqReg) & 0x04) break
            t--
        }
        writeReg(CommandReg, PCD_IDLE)
        return [readReg(CRCResultRegL), readReg(CRCResultRegH)]
    }

    function withCRC(data: number[]): number[] {
        const crc = calcCRC(data)
        return data.concat(crc)
    }

    /** WUPA: weckt Tags in jedem Zustand (auch READY/HALT). */
    function wakeTag(): boolean {
        writeReg(BitFramingReg, 0x07)      // 7-Bit-Short-Frame
        toCard(PCD_TRANSCEIVE, [PICC_WUPA])
        return lastStatus == STATUS_OK && lastBits == 16
    }

    /** Antikollision Cascade Level 1: 4 UID-Bytes + BCC, BCC wird geprüft. */
    function anticoll(): number[] {
        writeReg(BitFramingReg, 0x00)
        const res = toCard(PCD_TRANSCEIVE, [PICC_ANTICOLL_CL1, 0x20])
        if (lastStatus != STATUS_OK || res.length != 5) return []
        if ((res[0] ^ res[1] ^ res[2] ^ res[3]) != res[4]) return []
        return res
    }

    function selectTag(uid5: number[]): boolean {
        const buf = withCRC([PICC_ANTICOLL_CL1, 0x70].concat(uid5))
        toCard(PCD_TRANSCEIVE, buf)
        return lastStatus == STATUS_OK && lastBits == 0x18
    }

    function authenticate(block: number, uid5: number[]): boolean {
        let buf = [PICC_AUTHENT1A, block]
        buf = buf.concat(KEY_A)
        buf = buf.concat(uid5.slice(0, 4))
        toCard(PCD_AUTHENT, buf)
        return lastStatus == STATUS_OK && (readReg(Status2Reg) & 0x08) != 0
    }

    function stopCrypto(): void {
        clearBits(Status2Reg, 0x08)
    }

    function haltTag(): void {
        toCard(PCD_TRANSCEIVE, withCRC([PICC_HALT, 0x00]))  // Tag antwortet nicht, Timeout ist erwartet
    }

    function readBlock(block: number): number[] {
        const res = toCard(PCD_TRANSCEIVE, withCRC([PICC_READ, block]))
        if (lastStatus != STATUS_OK || res.length < 16) return []
        return res.slice(0, 16)          // 16 Datenbytes, CRC abschneiden
    }

    function isAck(res: number[]): boolean {
        return lastStatus == STATUS_OK && lastBits == 4 && res.length > 0 && (res[0] & 0x0F) == 0x0A
    }

    function writeBlock(block: number, data16: number[]): boolean {
        if (!isAck(toCard(PCD_TRANSCEIVE, withCRC([PICC_WRITE, block])))) return false
        return isAck(toCard(PCD_TRANSCEIVE, withCRC(data16)))
    }

    /** Wake + Antikollision; liefert 5 Bytes (UID + BCC) oder []. */
    function detect(): number[] {
        if (!wakeTag()) return []
        return anticoll()
    }

    function hex2(n: number): string {
        const h = "0123456789ABCDEF"
        return h.charAt((n >> 4) & 0x0F) + h.charAt(n & 0x0F)
    }

    function usesMatrixPin(p: DigitalPin): boolean {
        const matrix = [DigitalPin.C4, DigitalPin.C5, DigitalPin.C6, DigitalPin.C7, DigitalPin.C8,
            DigitalPin.C9, DigitalPin.C10, DigitalPin.C11, DigitalPin.C12]
        return matrix.indexOf(p) >= 0
    }

    // ---------- Öffentliche API ----------

    /**
     * Initialisiert den MFRC522 über Hardware-SPI an frei wählbaren Pins.
     * Liegt ein Pin auf C4–C12, wird die LED-Matrix abgeschaltet (gemeinsame Leitungen).
     */
    //% block="MFRC522 initialisieren|CS %cs|SCK %sck|MOSI %mosi|MISO %miso"
    //% cs.defl=DigitalPin.C4 sck.defl=DigitalPin.C5 mosi.defl=DigitalPin.C6 miso.defl=DigitalPin.C7
    //% weight=100
    export function Init(cs: DigitalPin, sck: DigitalPin, mosi: DigitalPin, miso: DigitalPin): void {
        csPin = cs
        if (usesMatrixPin(cs) || usesMatrixPin(sck) || usesMatrixPin(mosi) || usesMatrixPin(miso)) {
            led.enable(false)
        }
        pins.digitalWritePin(csPin, 1)
        pins.spiPins(mosi, miso, sck)
        pins.spiFormat(8, 0)
        pins.spiFrequency(1000000)

        writeReg(CommandReg, PCD_SOFTRESET)
        basic.pause(50)                     // Oszillator-Anlauf nach Reset

        writeReg(TModeReg, 0x8D)            // Timer: TAuto, Prescaler-High
        writeReg(TPrescalerReg, 0x3E)       // ~2 kHz Timer-Takt
        writeReg(TReloadRegH, 0)
        writeReg(TReloadRegL, 30)           // ~15 ms Timeout
        writeReg(TxASKReg, 0x40)            // 100 % ASK
        writeReg(ModeReg, 0x3D)             // CRC-Preset 0x6363

        if ((readReg(TxControlReg) & 0x03) != 0x03) {
            setBits(TxControlReg, 0x03)     // Antenne an
        }
    }

    /**
     * Liest die UID des Tags als Hex-String (z. B. "21-C5-1C-1A").
     * Gibt "" zurück, wenn kein Tag erkannt wird. Blockiert nicht.
     */
    //% block="Tag-UID lesen"
    //% weight=95
    export function getUID(): string {
        const uid = detect()
        if (uid.length != 5) return ""
        return hex2(uid[0]) + "-" + hex2(uid[1]) + "-" + hex2(uid[2]) + "-" + hex2(uid[3])
    }

    /**
     * Liest die UID als Zahl (4 Bytes, ohne Prüfbyte).
     * Gibt 0 zurück, wenn kein Tag erkannt wird. Blockiert nicht.
     */
    //% block="Tag-ID lesen (Zahl)"
    //% weight=90
    export function getID(): number {
        const uid = detect()
        if (uid.length != 5) return 0
        return ((uid[0] * 256 + uid[1]) * 256 + uid[2]) * 256 + uid[3]
    }

    /**
     * Prüft, ob ein Tag im Feld liegt.
     */
    //% block="Tag erkannt"
    //% weight=85
    export function isTagPresent(): boolean {
        return detect().length == 5
    }

    /**
     * Liest bis zu 48 Zeichen Text aus den Blöcken 8–10 (MIFARE Classic, Standard-Key).
     * Gibt "" zurück bei fehlendem Tag oder Fehler. Blockiert nicht.
     */
    //% block="Daten lesen"
    //% weight=80
    export function read(): string {
        const uid = detect()
        if (uid.length != 5) return ""
        let text = ""
        if (selectTag(uid) && authenticate(AUTH_BLOCK, uid)) {
            for (let b = 0; b < DATA_BLOCKS.length; b++) {
                const block = readBlock(DATA_BLOCKS[b])
                if (block.length != 16) {
                    text = ""
                    break
                }
                for (let k = 0; k < 16; k++) {
                    text += String.fromCharCode(block[k])
                }
            }
        }
        stopCrypto()
        haltTag()
        // Füllzeichen (Leerzeichen/Nullbytes) am Ende entfernen
        let end = text.length
        while (end > 0 && (text.charCodeAt(end - 1) == 32 || text.charCodeAt(end - 1) == 0)) end--
        return text.substr(0, end)
    }

    /**
     * Schreibt bis zu 48 Zeichen Text in die Blöcke 8–10 (MIFARE Classic, Standard-Key).
     * Gibt true zurück, wenn alle Blöcke geschrieben wurden.
     */
    //% block="Daten schreiben %text"
    //% weight=75
    export function write(text: string): boolean {
        const uid = detect()
        if (uid.length != 5) return false
        let ok = false
        if (selectTag(uid) && authenticate(AUTH_BLOCK, uid)) {
            const data: number[] = []
            for (let i = 0; i < 48; i++) {
                data.push(i < text.length ? text.charCodeAt(i) & 0xFF : 32)
            }
            ok = true
            for (let b = 0; b < DATA_BLOCKS.length; b++) {
                if (!writeBlock(DATA_BLOCKS[b], data.slice(b * 16, (b + 1) * 16))) {
                    ok = false
                    break
                }
            }
        }
        stopCrypto()
        haltTag()
        return ok
    }

    /**
     * Liest das Versionsregister. 145 (0x91) = v1.0, 146 (0x92) = v2.0.
     * Klone liefern oft andere Werte (z. B. 0x88, 0xB2). 0 oder 255 = keine Verbindung.
     */
    //% block="MFRC522 Chip-Version"
    //% advanced=true
    export function getVersion(): number {
        return readReg(VersionReg)
    }

    /**
     * Schaltet die Antenne ab (spart Strom).
     */
    //% block="Antenne ausschalten"
    //% advanced=true
    export function AntennaOff(): void {
        clearBits(TxControlReg, 0x03)
    }

    /**
     * Schaltet die Antenne wieder ein.
     */
    //% block="Antenne einschalten"
    //% advanced=true
    export function AntennaOn(): void {
        setBits(TxControlReg, 0x03)
    }
}
