const app = require("./app");
//const { PORT } = require("./config");

//const PORT = process.env.PORT || 8000;

app.listen(process.env.PORT || 8000, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
