const date = new Date();
console.log('Current local time:', date.toString());
console.log('Current UTC time:', date.toUTCString());
console.log('Current getDate():', date.getDate());
console.log('Current getUTCDate():', date.getUTCDate());
console.log();

// Simulate what happens with Firebase Timestamp
const testDate = new Date('2024-12-26T23:30:00.000Z'); // Late night UTC
console.log('Test date UTC:', testDate.toUTCString());
console.log('Test date local:', testDate.toString());
console.log('Test getDate():', testDate.getDate());
console.log('Test getUTCDate():', testDate.getUTCDate());
console.log();

// Test our conversion function logic
const year = testDate.getFullYear();
const month = String(testDate.getMonth() + 1).padStart(2, '0');
const day = String(testDate.getDate()).padStart(2, '0');
console.log('Our format (local):', `${year}-${month}-${day}`);

const yearUTC = testDate.getUTCFullYear();
const monthUTC = String(testDate.getUTCMonth() + 1).padStart(2, '0');
const dayUTC = String(testDate.getUTCDate()).padStart(2, '0');
console.log('UTC format:', `${yearUTC}-${monthUTC}-${dayUTC}`);
