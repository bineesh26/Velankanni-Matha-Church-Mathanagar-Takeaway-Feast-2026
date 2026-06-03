const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // Serve static front-end assets using absolute directory path

// Middleware to ensure database connection is configured for API routes
app.use('/api', (req, res, next) => {
    if (!MONGODB_URI) {
        return res.status(500).json({ error: 'Database connection string (MONGODB_URI) is not configured in Vercel environment variables.' });
    }
    next();
});

// --- MongoDB Schemas & Models ---

const ItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true }
});

const Item = mongoose.model('Item', ItemSchema);

const OrderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    items: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    total: { type: Number, required: true },
    notes: { type: String, default: "" },
    delivered: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', OrderSchema);

// --- Database Seeder ---
async function seedDatabase() {
    try {
        const count = await Item.countDocuments();
        if (count === 0) {
            console.log('No food items found. Seeding initial database item...');
            await Item.create({
                name: 'Kappa & Chicken Curry',
                category: 'Non-Veg · Kerala Special',
                description: 'Tender tapioca served with a richly spiced Kerala-style Chicken curry — a beloved parish favourite, made fresh on the day.',
                price: 100,
                image: 'Food.png' // Use portable relative path
            });
            console.log('Database seeded successfully!');
        } else {
            console.log(`Database already has ${count} items. Skipping seeding.`);
        }

        // Migrate any existing items from Kappa & Meat Curry to Kappa & Chicken Curry
        const updatedItem = await Item.updateMany(
            { name: { $regex: /Kappa & Meat Curry/i } },
            { 
                name: 'Kappa & Chicken Curry',
                description: 'Tender tapioca served with a richly spiced Kerala-style Chicken curry — a beloved parish favourite, made fresh on the day.',
                image: 'Food.png'
            }
        );
        if (updatedItem.modifiedCount > 0) {
            console.log(`Updated ${updatedItem.modifiedCount} items from Meat Curry to Chicken Curry in database.`);
        }

        // Migrate any existing orders containing Kappa & Meat Curry
        const updatedOrders = await Order.updateMany(
            { "items.name": { $regex: /Kappa & Meat Curry/i } },
            { $set: { "items.$[elem].name": "Kappa & Chicken Curry" } },
            { arrayFilters: [{ "elem.name": { $regex: /Kappa & Meat Curry/i } }] }
        );
        if (updatedOrders.modifiedCount > 0) {
            console.log(`Updated ${updatedOrders.modifiedCount} orders from Meat Curry to Chicken Curry in database.`);
        }
    } catch (err) {
        console.error('Error seeding database:', err);
    }
}

// --- API Endpoints ---

// Get all food items
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find();
        res.json(items);
    } catch (err) {
        console.error('Error fetching items:', err);
        res.status(500).json({ error: 'Failed to retrieve food items.' });
    }
});

// Submit a new order
app.post('/api/orders', async (req, res) => {
    try {
        const { name, phone, address, items, notes, total } = req.body;

        if (!name || !phone || !address || !items || !items.length || total === undefined) {
            return res.status(400).json({ error: 'Please provide name, phone, address, items, and total.' });
        }

        const newOrder = new Order({
            name,
            phone,
            address,
            items,
            notes,
            total
        });

        await newOrder.save();
        console.log(`Successfully saved order ${newOrder._id} for ${name}`);
        res.status(201).json({ message: 'Order confirmed!', orderId: newOrder._id });
    } catch (err) {
        console.error('Error saving order:', err);
        res.status(500).json({ error: 'Failed to save pre-order. Please try again.' });
    }
});

// --- Dashboard API Endpoints ---

// Get all orders (for admin dashboard)
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ error: 'Failed to retrieve orders.' });
    }
});

// Get dashboard stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        const deliveredCount = await Order.countDocuments({ delivered: true });
        const pendingCount = totalOrders - deliveredCount;
        const totalRevenueResult = await Order.aggregate([
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;
        const totalPlatesResult = await Order.aggregate([
            { $unwind: '$items' },
            { $group: { _id: null, plates: { $sum: '$items.quantity' } } }
        ]);
        const totalPlates = totalPlatesResult.length > 0 ? totalPlatesResult[0].plates : 0;
        res.json({ totalOrders, deliveredCount, pendingCount, totalRevenue, totalPlates });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to retrieve stats.' });
    }
});

// Toggle delivered status
app.patch('/api/orders/:id/deliver', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found.' });
        order.delivered = !order.delivered;
        await order.save();
        res.json({ delivered: order.delivered });
    } catch (err) {
        console.error('Error updating delivery status:', err);
        res.status(500).json({ error: 'Failed to update order.' });
    }
});

// Delete an order (admin only)
app.delete('/api/orders/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ message: 'Order deleted.' });
    } catch (err) {
        console.error('Error deleting order:', err);
        res.status(500).json({ error: 'Failed to delete order.' });
    }
});

// --- Start Server ---
if (!MONGODB_URI) {
    console.error('\n========================================================================');
    console.error('CRITICAL ERROR: MONGODB_URI is not defined in the environment variables!');
    console.error('Please configure your database connection string in the Vercel Settings or .env file.');
    console.error('========================================================================\n');
} else {
    mongoose.connect(MONGODB_URI)
        .then(async () => {
            console.log('Successfully connected to MongoDB Cluster');
            await seedDatabase();

            if (!process.env.VERCEL) {
                app.listen(PORT, () => {
                    console.log(`Server is running on http://localhost:${PORT}`);
                    
                    // Automatically open the app in the default browser
                    const { exec } = require('child_process');
                    const url = `http://localhost:${PORT}`;
                    
                    // Determine the command based on the OS (Mac uses 'open', Windows uses 'start', Linux uses 'xdg-open')
                    const command = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
                    exec(`${command} ${url}`);
                });
            }
        })
        .catch(err => {
            console.error('Database connection error:', err);
        });
}

module.exports = app;
