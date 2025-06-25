// import pkg from "pg";
// const { Pool }=pkg;

// const pool=new Pool({
//     user: "postgres",
//     host: "localhost",
//     database: "mizu",
//     password: "jimmy123",
//     port: 5432,
// });

// export default pool;

// db.js

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;
