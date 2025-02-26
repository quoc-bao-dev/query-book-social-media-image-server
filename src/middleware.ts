import { NextFunction, Request, Response } from 'express';

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_KEY) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    next();
};

export default authMiddleware;
