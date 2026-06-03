const mongoose = require('mongoose');
require('dotenv').config();

async function countDocs() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const db = mongoose.connection.db;
        
        // Count items in 'items' collection
        const itemsCount = await db.collection('items').countDocuments();
        console.log(`Items (food menu): ${itemsCount}`);
        
        // Count orders in 'orders' collection
        const ordersCount = await db.collection('orders').countDocuments();
        console.log(`Orders placed: ${ordersCount}`);
        
    } catch (err) {
        console.error('Error counting documents:', err);
    } finally {
        await mongoose.disconnect();
    }
}

countDocs();
