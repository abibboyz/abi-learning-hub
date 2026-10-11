import { app, prepare } from "./app.js";

const PORT = Number(process.env.PORT || 8001);

prepare().then(() => app.listen(PORT, () => console.log(`api-node listening on :${PORT}`)));
