import express from 'express';

export const makeServer = (onRequest) => {
  const app = express();

  app.get('*', async (req, res) => {
    try {
      onRequest(req, res);
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  });

  app.listen(3000, () => {
    console.log(`Server started on port 3000`);
  });
};
