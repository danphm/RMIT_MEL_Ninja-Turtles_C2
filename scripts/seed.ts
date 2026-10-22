// npm run seed — reset the app database and evidence store to the fictional demo state.
// TideCloak roles are NOT touched: those changes are governed and go through the IGA quorum.
import { seedDemo } from "../src/lib/seed";

seedDemo();
console.log("CaseCommons demo data seeded (fictional). Personas are unclaimed; visit /demo-setup after signing in.");
