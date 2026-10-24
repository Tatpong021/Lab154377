import express from 'express';
const app = express();
const port = 3000;

app.use('/', express.static('www'));

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log("Tatpong Deemun")
});