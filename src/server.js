const app = require("./app");
const { PORT } = require("./config");

app.listen(40565, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
