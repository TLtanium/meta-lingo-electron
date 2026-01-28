import { Box, CircularProgress, Typography, Backdrop } from '@mui/material'

interface LoadingOverlayProps {
  open: boolean
  message?: string
  progress?: number
}

export default function LoadingOverlay({ open, message, progress }: LoadingOverlayProps) {
  return (
    <Backdrop
      sx={{ 
        color: '#fff', 
        zIndex: (theme) => theme.zIndex.drawer + 1,
        flexDirection: 'column',
        gap: 2
      }}
      open={open}
    >
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress 
          color="inherit" 
          variant={progress !== undefined ? 'determinate' : 'indeterminate'}
          value={progress}
          size={60}
        />
        {progress !== undefined && (
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="caption"
              component="div"
              color="inherit"
            >
              {`${Math.round(progress)}%`}
            </Typography>
          </Box>
        )}
      </Box>
      {message && (
        <Typography variant="body1" color="inherit">
          {message}
        </Typography>
      )}
    </Backdrop>
  )
}

