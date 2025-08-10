const test = require('firebase-functions-test')({
    projectId: 'pulazzz-delivery-system-test',
    storageBucket: 'pulazzz-delivery-system-test.appspot.com',
});
const assert = require('assert');
const admin = require('firebase-admin');
const myFunctions = require('../index.js');

// Main describe block to hold shared setup
describe('Representative, Reseller, and Order Features', () => {

    let representativeUser;
    let resellerUser;

    // Shared setup for all tests
    before(async () => {
        // Create a representative user
        representativeUser = await admin.auth().createUser({
            email: 'representative@test.com',
            password: 'password123',
            displayName: 'Representative User'
        });
        await admin.auth().setCustomUserClaims(representativeUser.uid, { role: 'representatif' });
        await admin.firestore().collection('profiles').doc(representativeUser.uid).set({
            name: 'Representative User', email: 'representative@test.com', role: 'representatif'
        });

        // Create a reseller user linked to the representative
        resellerUser = await admin.auth().createUser({
            email: 'reseller@test.com',
            password: 'password123',
            displayName: 'Reseller User'
        });
        await admin.auth().setCustomUserClaims(resellerUser.uid, { role: 'reseller', representativeId: representativeUser.uid });
        await admin.firestore().collection('profiles').doc(resellerUser.uid).set({
            name: 'Reseller User', email: 'reseller@test.com', role: 'reseller',
            representativeId: representativeUser.uid, referralId: representativeUser.uid
        });
    });

    // Shared cleanup after all tests
    after(async () => {
        // Clean up all users and data
        const users = await admin.auth().listUsers();
        const deletePromises = users.users.map(u => admin.auth().deleteUser(u.uid));
        await Promise.all(deletePromises);
        await test.firestore.clearFirestoreData({ projectId: 'pulazzz-delivery-system-test' });
        test.cleanup();
    });

    // Test suite for User logic
    describe('User Creation and Roles', () => {
        let wrappedCompleteSignup;

        before(() => {
            wrappedCompleteSignup = test.wrap(myFunctions.completeSignup);
        });

        it('should create a reseller under the correct representative when invited by a representative', async () => {
            const inviteeEmail = 'new-by-rep@test.com';
            const referralCode = 'invite-from-rep';
            await admin.firestore().collection('invitations').doc(referralCode).set({
                inviterUid: representativeUser.uid, inviteeEmail, status: 'pending'
            });

            await wrappedCompleteSignup({
                data: { referralCode, password: 'password123', name: 'N', phone: '081234567890', address: 'A', district: 'D', city: 'C', province: 'P' }
            });

            const newUser = await admin.auth().getUserByEmail(inviteeEmail);
            assert.strictEqual(newUser.customClaims.role, 'reseller');
            assert.strictEqual(newUser.customClaims.representativeId, representativeUser.uid);
            const profile = await admin.firestore().collection('profiles').doc(newUser.uid).get();
            assert.strictEqual(profile.data().referralId, representativeUser.uid);
        });

        it('should create a reseller under the SAME representative when invited by another reseller', async () => {
            const inviteeEmail = 'new-by-reseller@test.com';
            const referralCode = 'invite-from-reseller';
            await admin.firestore().collection('invitations').doc(referralCode).set({
                inviterUid: resellerUser.uid, inviteeEmail, status: 'pending'
            });

            await wrappedCompleteSignup({
                data: { referralCode, password: 'password123', name: 'N', phone: '081234567891', address: 'A', district: 'D', city: 'C', province: 'P' }
            });

            const newUser = await admin.auth().getUserByEmail(inviteeEmail);
            assert.strictEqual(newUser.customClaims.role, 'reseller');
            assert.strictEqual(newUser.customClaims.representativeId, representativeUser.uid);
            const profile = await admin.firestore().collection('profiles').doc(newUser.uid).get();
            assert.strictEqual(profile.data().referralId, resellerUser.uid);
        });
    });

    // Test suite for Order logic
    describe('Order Creation', () => {
        let wrappedCreateOrder;

        before(() => {
            wrappedCreateOrder = test.wrap(myFunctions.createOrderAndProfile);
        });

        it('should assign correct representativeId when a representative creates an order', async () => {
            const authContext = { uid: representativeUser.uid, token: { role: 'representatif', email: 'representative@test.com' } };
            const orderData = {
                customerInfo: { name: 'Cust by Rep', phone: '081234567892' },
                shippingAddress: { fullAddress: 'Addr', district: 'D', city: 'C', province: 'P' },
                items: [{ subtotal: 100 }], paymentMethod: 'cod'
            };

            const result = await wrappedCreateOrder({ data: orderData, auth: authContext });
            const order = await admin.firestore().collection('orders').doc(result.orderId).get();
            assert.strictEqual(order.data().representativeId, representativeUser.uid);
        });

        it('should assign correct representativeId when a reseller creates an order', async () => {
            const authContext = { uid: resellerUser.uid, token: { role: 'reseller', representativeId: representativeUser.uid, email: 'reseller@test.com' } };
            const orderData = {
                customerInfo: { name: 'Cust by Reseller', phone: '081234567893' },
                shippingAddress: { fullAddress: 'Addr', district: 'D', city: 'C', province: 'P' },
                items: [{ subtotal: 100 }], paymentMethod: 'cod'
            };

            const result = await wrappedCreateOrder({ data: orderData, auth: authContext });
            const order = await admin.firestore().collection('orders').doc(result.orderId).get();
            assert.strictEqual(order.data().representativeId, representativeUser.uid);
        });
    });
});
