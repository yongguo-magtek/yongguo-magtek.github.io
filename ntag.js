class MTNFCTLV {
    constructor(Tag, Value) {
        this.Tag = Tag;
        this.Value = Value;
    }

    toByteArray() {
        let result = [Tag];
        let length = value.length;
        if (length > 0xFF) {

        } else {
            result.push(length);
        }
    }

    static parse(data) {
        let index = 0;
        const result = [];

        while (index < data.length) {
            const tag = data[index];
            index += 1;

            if (tag === 0xFE) { // terminator
                break;
            }

            const length1 = data[index];
            index += 1;

            let length = length1;
            if (length1 === 0xFF) {
                length = data[index] * 256 + data[index + 1];
                index += 2;
            }
            const valueEndIndex = index + length;

            const value = data.slice(index, valueEndIndex);
            index = valueEndIndex;
            result.push(new MTNFCTLV(tag, value));
        }

        return result;
    }

    static makeType2(content){
        if (content instanceof(MTNdefMessage)) {
            content = content.toByteArray();
        }

    }
}

class MTNdefRecord {
    constructor(recordType,data,id,mediaType,encoding,lang) {

        if (typeof mediaType === "undefined") {
            mediaType = null;
        }

        if (typeof encoding === "undefined") {
            encoding = null;
        }

        if (typeof lang === "undefined") {
            lang = null;
        }

        /// Returns the record type of the record. Records must have either a standardized well-known type name such as "empty", "text", "url", "smart-poster", "absolute-url", "mime", or "unknown" or else an external type name, which consists of a domain name and custom type name separated by a colon (":").
        this.recordType = recordType;
        /// Returns the MIME type of the record. This value will be null if recordType is not equal to "mime".
        this.mediaType = mediaType;
        /// Returns the record identifier, which is an absolute or relative URL used to identify the record.
        this.id = id;
        /// Returns a DataView containing the raw bytes of the record's payload.
        this.data = data;
        /// Returns the encoding of a textual payload, or null otherwise.
        this.encoding = encoding;
        /// Returns the language of a textual payload, or null if one was not supplied.
        this.lang = lang;
    }

    static fromRecord(record) {
        let recordType, mediaType, id, data, encoding, lang;
        if (NdefLibrary.NdefTextRecord.isRecordType(record)) {
            record = new NdefLibrary.NdefTextRecord(record);
            let text = record.getText();
            let object = new MTNdefRecord("text",record.getPayload(), record.getId(),null, record.getTextEncoding() ==  1 ? "utf16" : "utf8", record.getLanguageCode());
            object.text = text;
            object._record = record;
            object.toByteArray = function() { return record.toByteArray(); };
            return object;
        } else if (NdefLibrary.NdefUriRecord.isRecordType(record)) {
            record = new NdefLibrary.NdefUriRecord(record);
            let url = record.getUri();
            let object = new MTNdefRecord("url",record.getPayload(), record.getId(),null, null, null);
            object.url = url;
            object._record = record;
            object.toByteArray = function() { return record.toByteArray(); };
            return object;
        }
        return null;
    } 

    static fromObject(object) {
        if (typeof object === "string") {
            if (object.toLowerCase().startsWith("http://") || object.toLowerCase().startsWith("https://") ) {
                object = {url: object};
            } else {
                object = {text: object};
            }
        }
        if (typeof object.text === "string") {
            let record = new NdefLibrary.NdefTextRecord();
            record.setText(object.text);
            let result = new MTNdefRecord("text",record.getPayload(), record.getId(),null, record.getTextEncoding() ==  1 ? "utf16" : "utf8", record.getLanguageCode());
            result.text = object.text;
            result._record = record;
            result.toByteArray = function() { return record.toByteArray(); };
            return result;
        } else if (typeof object.url === "string") {
            let record = new NdefLibrary.NdefUriRecord();
            record.setUri(object.url);
            let result = new MTNdefRecord("text",record.getPayload(), record.getId(),null, null, null);
            result.url = object.url;
            result._record = record;
            result.toByteArray = function() { return record.toByteArray(); };
            return result;
        }
        return null;
    }
}

///
class MTNdefMessage {
    constructor(records) {
        let message = new NdefLibrary.NdefMessage();
        if (Array.isArray(records)) {
            records.forEach(record => {
                if (record instanceof(MTNdefRecord)) {
                    message.push(record._record);
                } else {
                    message.push(record);
                }
            });
        } else {
            if (records instanceof(MTNdefRecord)) {
                message.push(records._record);
            } else {
                message.push(records);
            }
        }

        this._message = message;
    }

    get records () {
        var records = this._message.getRecords();
        return records.map(x=>MTNdefRecord.fromRecord(x));
    }

    toByteArray() {
        return this._message.toByteArray();
    }

    static fromByteArray(bytes) {
        let message = NdefLibrary.NdefMessage.fromByteArray(bytes);
        let records = message.getRecords();
        return new MTNdefMessage(records);
    }

    static fromMessage(message) {
        let records = message.getRecords();
        return new MTNdefMessage(records);
    }

    static fromObject(object) {
        if (object instanceof (MTNdefMessage)) {
            return object;
        } else if (Array.isArray(object)) {
            return new MTNdefMessage(object.map(x=> MTNdefRecord.fromObject( x )));
        } else {
            return new MTNdefMessage(MTNdefRecord.fromObject( object));
        }
    }
}


class NTag {
    /// use raw command to read/write ntag card
    /// @param sendNfc : an async function to send nfc command
    constructor(sendNfc) {
        if (typeof sendNfc === "undefined") {
            console.log("Need NFC command interface for NTAG class")
            throw Error("Need NFC command interface for NTAG class")
        }
        this.GET_VERSION = "60";
        this.READ = "30";
        this.FAST_READ = "3A";
        this.WRITE = "A2";
        this.sendNfc = sendNfc;
        this.userSize = 0;
    }

    async getVersion() {
        await this.sendNfc(this.GET_VERSION, false);
    }

    async getMemorySize() {
        if (this.userSize === 0) {
            const vhex = await this.readOne(0);
            this.userSize = vhex.length > 15 ? vhex[14] : 0;
        }
        return this.userSize * 8;
    }

    async readAll() {
        console.log("NTAG readAll");

        if (this.userSize === 0) {
            const vhex = await this.readOne(0);
            this.userSize = vhex.length > 15 ? vhex[14] : 0;
        } else {
            console.log("SIZE is " + this.userSize);
        }

        const readCount = 255 - 4; // read all in one shot

        if (this.userSize > 0) {
            const result = [];
            const lastBlock = this.userSize * 2 + 4 - 1;
            for (let start = 4; start < lastBlock; start += readCount) {
                const isLastRead = start + readCount > lastBlock;
                const endBlock = isLastRead ? lastBlock : start + readCount - 1;

                const value = await this.fastRead(start, endBlock, isLastRead);
                result.push(...value);
            }
            return result;
        } else {
            return [];
        }
    }

    async readNdef() {
        const all = await this.readAll();

        let tlvs = MTNFCTLV.parse(all);
        let messages = tlvs.map((tlv)=>NdefLibrary.NDefMessage.fromByteArray(tlv.Value));
   
        let mtMessages = messages.map(m=> MTNdefMessage.fromMessage(m));

        return mtMessages.length == 1 ? mtMessages[0] : mtMessages;
    }

    async writeAll(data) {
        const firstBlock = 4;
        const endBlock = Math.ceil(data.length / 4) + 4 - 1;
        if (endBlock > this.userSize * 2) {
            throw new Error("Data is more than tag maximum size");
        }

        let index = 0;
        let success = true;
        for (let block = firstBlock; block < endBlock; block++) {
            success = await this.writeOne(block, data.slice(index, index + 4));
            index += 4;
            if (!success) {
                break;
            }
        }

        if (success) {
            success = await this.writeOne(endBlock, data.slice(index), true);
        }

        return success;
    }

    /// @param records | message 
    async writeNdef(records) {
        const data = MTNdef.BuildNDEFMessage(records);
        return await this.writeAll(data);
    }

    async readOne(block, lastCommand = false) {
        console.log("Read block " + block);
        const hexBlock = block.toString(16).padStart(2, '0').toUpperCase();
        const vhex = await this.sendNfc(this.READ + hexBlock, lastCommand);
        return this.byteArrayFromHexString(vhex);
    }

    async fastRead(startBlock, endBlock, lastCommand = false) {
        const hexStartBlock = startBlock.toString(16).padStart(2, '0').toUpperCase();
        const hexEndBlock = endBlock.toString(16).padStart(2, '0').toUpperCase();
        const vhex = await this.sendNfc(this.FAST_READ + hexStartBlock + hexEndBlock, lastCommand);

        console.log("READ_READ - " + vhex);
        return this.byteArrayFromHexString(vhex);
    }

    async writeOne(block, data, lastCommand = false) {
        const hexStartBlock = block.toString(16).padStart(2, '0').toUpperCase();
        // Implementation for writing one block goes here
    }

    byteArrayFromHexString(hexString) {
        const result = [];
        for (let i = 0; i < hexString.length; i += 2) {
            result.push(parseInt(hexString.substr(i, 2), 16));
        }
        return result;
    }
}

