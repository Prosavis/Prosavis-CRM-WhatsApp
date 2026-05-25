import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import type { User } from '@/types';

interface UserDetailsDialogProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
}

export default function UserDetailsDialog({ open, user, onClose }: UserDetailsDialogProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Perfil de contacto</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          ID: {user.id}
        </Typography>
        {(user.name || user.displayName) && (
          <Typography variant="body1">{user.name || user.displayName}</Typography>
        )}
        {user.email && <Typography variant="body2">{user.email}</Typography>}
        {user.phoneNumber && <Typography variant="body2">{user.phoneNumber}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
