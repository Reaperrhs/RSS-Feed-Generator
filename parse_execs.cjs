const fs = require('fs');
try {
    const data = JSON.parse(fs.readFileSync('executions.json', 'utf8'));
    console.log("Count:", data.executions.length);
    const execs = data.executions
        .sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt))
        .slice(0, 5);
    // Actually, usually lists are desc. 
    execs.forEach(e => {
        console.log(`ID: ${e.$id}`);
        console.log(`Date: ${e.$createdAt}`);
        console.log(`Status: ${e.status}`);
        console.log(`Code: ${e.responseStatusCode}`);
        console.log(`Error: ${e.errors ? e.errors.substring(0, 200).replace(/\n/g, ' ') : 'None'}`);
        console.log('---');
    });
} catch (e) {
    console.error(e);
}
