import { Router, Request, Response, NextFunction } from 'express';
import Todo from '../models/Todo';
import auth from '../middleware/auth';

const router = Router();

router.use(auth);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const todos = await Todo.find({ user: req.userId }).sort({ createdAt: -1 });
    res.json(todos);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body as { title?: string };
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'title is required' });
    }
    const todo = await Todo.create({ user: req.userId, title: title.trim() });
    res.status(201).json(todo);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, completed } = req.body as { title?: string; completed?: boolean };
    const update: Record<string, unknown> = {};
    if (typeof title === 'string') update.title = title.trim();
    if (typeof completed === 'boolean') update.completed = completed;

    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    );
    if (!todo) return res.status(404).json({ message: 'Todo not found' });
    res.json(todo);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!todo) return res.status(404).json({ message: 'Todo not found' });
    res.json({ message: 'Deleted', id: todo._id });
  } catch (err) {
    next(err);
  }
});

export default router;
