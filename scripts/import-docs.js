import { db, initSchema, seedDatabase } from '../server/db.js';

initSchema();
await seedDatabase();

const protectors = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'protetor'").get().total;
const slots = db.prepare('SELECT COUNT(*) AS total FROM slots').get().total;

console.log(`Importação concluída: ${protectors} protetores e ${slots} vagas cadastradas.`);
db.close();
