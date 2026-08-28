import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DesignTokens } from '@/constants/designSystem';
import {
  getCompanyHandbookChapters,
  getHandbookChapter,
  type HandbookChapterId,
  type HandbookEntry,
} from '@/constants/companyHandbook';

const COVER_BLUE = DesignTokens.brand.primary.blue;
const COVER_ORANGE = DesignTokens.brand.primary.orange;
const PAGE_CREAM = '#f7f1e4';
const PAGE_INK = '#2a2218';

function MiniBookIcon() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 26,
        height: 20,
        position: 'relative',
        perspective: 90,
        transformStyle: 'preserve-3d',
        transform: 'rotateY(-18deg) rotateX(8deg)',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 4,
          height: '100%',
          borderRadius: '2px 0 0 2px',
          background: `linear-gradient(180deg, ${COVER_ORANGE} 0%, ${DesignTokens.brand.secondary.darkOrange} 100%)`,
          boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.25)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: 3,
          top: 0,
          width: 21,
          height: '100%',
          borderRadius: '0 3px 3px 0',
          background: `linear-gradient(145deg, ${DesignTokens.brand.secondary.lightBlue} 0%, ${COVER_BLUE} 55%, ${DesignTokens.brand.secondary.darkBlue} 100%)`,
          boxShadow: '2px 3px 7px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.16)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          right: 1,
          top: 2,
          width: 2,
          height: 16,
          bgcolor: '#f3e6c8',
          boxShadow: '1px 0 0 #e7d4a6, 2px 0 0 #f8efd8',
        }}
      />
    </Box>
  );
}

function EntryRow({
  entry,
  onCopy,
}: {
  entry: HandbookEntry;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <Box
      sx={{
        py: 1,
        borderBottom: '1px solid rgba(42,34,24,0.1)',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" fontWeight={700} sx={{ color: PAGE_INK }}>
        {entry.label}
      </Typography>
      <Typography variant="caption" sx={{ color: 'rgba(42,34,24,0.68)', display: 'block', mb: 0.5 }}>
        {entry.description}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontFamily: entry.kind === 'email' || entry.kind === 'phone' ? 'ui-monospace, monospace' : 'inherit',
          wordBreak: 'break-word',
          mb: 0.75,
          color: PAGE_INK,
        }}
      >
        {entry.copyText}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => onCopy(entry.copyText, entry.label)}
          sx={{
            textTransform: 'none',
            borderColor: 'rgba(0,36,70,0.28)',
            color: COVER_BLUE,
          }}
        >
          Copiar
        </Button>
        {entry.openUrl && (
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<OpenInNewIcon />}
            href={entry.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            component="a"
            sx={{ textTransform: 'none' }}
          >
            Abrir
          </Button>
        )}
      </Box>
    </Box>
  );
}

const CompanyHandbookBook: React.FC = () => {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const reduceMotion = useReducedMotion();
  const chapters = useMemo(() => getCompanyHandbookChapters(), []);
  const [open, setOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [chapterId, setChapterId] = useState<HandbookChapterId>('whatsapp');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const chapter = getHandbookChapter(chapterId) ?? chapters[0];

  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`Copiado: ${label}`);
    } catch {
      setCopyFeedback('No se pudo copiar al portapapeles');
    }
  }, []);

  const handleOpen = () => {
    setChapterId('whatsapp');
    setOpen(true);
    if (reduceMotion) {
      setCoverOpen(true);
      return;
    }
    setCoverOpen(false);
    window.setTimeout(() => setCoverOpen(true), 40);
  };

  const handleClose = () => {
    if (reduceMotion) {
      setOpen(false);
      setCoverOpen(false);
      return;
    }
    setCoverOpen(false);
    window.setTimeout(() => setOpen(false), 280);
  };

  return (
    <>
      <Tooltip title="Libro de la empresa: copiar teléfonos, correos y redes">
        <IconButton
          size="small"
          onClick={handleOpen}
          aria-label="Abrir libro de la empresa"
          sx={{
            width: 36,
            height: 36,
            '&:hover': {
              bgcolor: (t) => t.palette.action.hover,
            },
          }}
        >
          <MiniBookIcon />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth={false}
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'visible',
            m: 1,
          },
        }}
        slotProps={{
          backdrop: { sx: { bgcolor: 'rgba(8, 12, 20, 0.72)' } },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: compact ? 'min(96vw, 420px)' : 760,
            height: compact ? 'min(86vh, 640px)' : 480,
            perspective: 1400,
          }}
        >
          <IconButton
            onClick={handleClose}
            aria-label="Cerrar libro"
            sx={{
              position: 'absolute',
              top: -12,
              right: -12,
              zIndex: 4,
              bgcolor: 'background.paper',
              boxShadow: 2,
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          <Box
            sx={{
              display: 'flex',
              width: '100%',
              height: '100%',
              borderRadius: 1.5,
              overflow: 'hidden',
              boxShadow: '0 22px 50px rgba(0,0,0,0.45)',
              bgcolor: PAGE_CREAM,
              position: 'relative',
            }}
          >
            <Box
              sx={{
                width: compact ? '38%' : '42%',
                p: compact ? 1.5 : 2.25,
                borderRight: '1px solid rgba(42,34,24,0.12)',
                background:
                  'linear-gradient(90deg, #efe6d4 0%, #f7f1e4 18%, #f7f1e4 100%)',
                overflow: 'auto',
              }}
            >
              <Typography
                variant="overline"
                sx={{ color: COVER_ORANGE, fontWeight: 800, letterSpacing: 1.2 }}
              >
                Índice
              </Typography>
              <Typography variant="h6" sx={{ color: COVER_BLUE, fontWeight: 800, mb: 1.5, lineHeight: 1.2 }}>
                Prosavis
              </Typography>
              {chapters.map((item, index) => {
                const selected = item.id === chapterId;
                return (
                  <Box
                    key={item.id}
                    component="button"
                    type="button"
                    onClick={() => setChapterId(item.id)}
                    sx={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      cursor: 'pointer',
                      bgcolor: selected ? 'rgba(0,36,70,0.08)' : 'transparent',
                      borderRadius: 1,
                      px: 1,
                      py: 0.85,
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ color: PAGE_INK }}>
                      {index + 1}. {item.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(42,34,24,0.65)' }}>
                      {item.summary}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            <Box
              sx={{
                flex: 1,
                p: compact ? 1.5 : 2.5,
                overflow: 'auto',
                background: 'linear-gradient(90deg, #f7f1e4 0%, #fffaf1 100%)',
              }}
            >
              <Typography variant="overline" sx={{ color: COVER_ORANGE, fontWeight: 800 }}>
                {chapter.title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(42,34,24,0.7)', mb: 1 }}>
                {chapter.summary}
              </Typography>
              {chapter.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onCopy={handleCopy} />
              ))}
            </Box>

            <AnimatePresence>
              {open && (
                <Box
                  component={motion.div}
                  initial={reduceMotion ? false : { rotateY: 0 }}
                  animate={{ rotateY: coverOpen ? -168 : 0 }}
                  exit={reduceMotion ? undefined : { rotateY: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: compact ? '62%' : '58%',
                    height: '100%',
                    transformOrigin: 'left center',
                    transformStyle: 'preserve-3d',
                    backfaceVisibility: 'hidden',
                    pointerEvents: coverOpen ? 'none' : 'auto',
                    zIndex: 3,
                  }}
                >
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      background: `linear-gradient(145deg, ${DesignTokens.brand.secondary.lightBlue} 0%, ${COVER_BLUE} 50%, ${DesignTokens.brand.secondary.darkBlue} 100%)`,
                      borderLeft: `10px solid ${COVER_ORANGE}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 8px 0 24px rgba(0,0,0,0.28)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      px: 3,
                    }}
                  >
                    <Box sx={{ textAlign: 'center', color: '#fff' }}>
                      <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.8 }}>
                        Libro de la casa
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        Prosavis
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.75 }}>
                        Teléfonos, correos y redes
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </AnimatePresence>
          </Box>
        </Box>
      </Dialog>

      <Snackbar open={Boolean(copyFeedback)} autoHideDuration={2500} onClose={() => setCopyFeedback(null)}>
        <Alert
          severity={copyFeedback?.startsWith('Copiado') ? 'success' : 'error'}
          variant="filled"
          onClose={() => setCopyFeedback(null)}
          sx={{ width: '100%' }}
        >
          {copyFeedback}
        </Alert>
      </Snackbar>
    </>
  );
};

export default CompanyHandbookBook;
