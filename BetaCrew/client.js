const net = require('net');
const fs = require('fs');

const client = new net.Socket();
const packets = [];
const receivedSequences = new Set();
let lastSequence = 0;
client.connect(3000, 'localhost', () => {
    console.log('Connected to server');
    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(1, 0);
    client.write(buffer);
});

client.on('data', (data) => {
    let offset = 0;
    console.log("The length is " + data.length);
    while (offset < data.length) {
        const symbol = data.toString('ascii', offset, offset + 4);
        const buySell = data.toString('ascii', offset + 4, offset + 5);
        const quantity = data.readUInt32BE(offset + 5);
        const price = data.readUInt32BE(offset + 9);
        const sequence = data.readUInt32BE(offset + 13);

        packets.push({ symbol, buySell, quantity, price, sequence });
        receivedSequences.add(sequence);
        lastSequence = Math.max(lastSequence, sequence);

        offset += 17;
    }
    console.log("The last sequence is " + lastSequence);
});

client.on('end', async () => {
    console.log('Disconnected from server');

    for (let seq = 1; seq <= lastSequence; seq++) {
        if (!receivedSequences.has(seq)) {
            await requestMissingPacket(seq);
        }
    }
    packets.sort((a, b) => a.sequence - b.sequence);

    fs.writeFileSync('output.json', JSON.stringify(packets, null, 2));
    console.log('output.json file created and saved');
    client.destroy();
});

client.on('error', (err) => {
    console.error('Connection error:', err);
});


async function requestMissingPacket(sequence) {
    return new Promise((resolve, reject) => {
        const resendClient = new net.Socket();
        resendClient.connect(3000, 'localhost', () => {
            const buffer = Buffer.alloc(2);
            buffer.writeUInt8(2, 0);
            buffer.writeUInt8(sequence, 1);
            resendClient.write(buffer);
        });

        resendClient.on('data', (data) => {
            const symbol = data.toString('ascii', 0, 4);
            const buySell = data.toString('ascii', 4, 5);
            const quantity = data.readUInt32BE(5);
            const price = data.readUInt32BE(9);
            const sequence = data.readUInt32BE(13);

            packets.push({ symbol, buySell, quantity, price, sequence });
            receivedSequences.add(sequence);

            resendClient.destroy();
            resolve();
        });

        resendClient.on('error', (err) => {
            console.error('Resend connection error:', err);
            resendClient.destroy();
            reject(err);
        });
    });
}
