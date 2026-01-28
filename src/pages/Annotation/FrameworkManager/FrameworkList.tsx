import React, { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Stack,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Skeleton
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  ViewModule as ViewModuleIcon,
  ViewList as ViewListIcon,
  Refresh as RefreshIcon,
  MoreVert as MoreVertIcon,
  Visibility as VisibilityIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  AccountTree as TreeIcon,
  Folder as FolderIcon,
  Label as LabelIcon,
  FileUpload as ImportIcon
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { frameworkApi } from '../../../api/framework'
import type { Framework, FrameworkCategory, FrameworkNode } from './types'

interface FrameworkListProps {
  categories: FrameworkCategory[]
  loading: boolean
  onSelect: (framework: Framework) => void
  onRefresh: () => void
  onImport: () => void
}

export const FrameworkList: React.FC<FrameworkListProps> = ({
  categories,
  loading,
  onSelect,
  onRefresh,
  onImport
}) => {
  const { t } = useTranslation()
  
  // UI state
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(12)
  
  // Menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null)
  
  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [useCustomCategory, setUseCustomCategory] = useState(true)
  const [newDescription, setNewDescription] = useState('')
  
  // Flatten frameworks from categories
  const allFrameworks = categories.flatMap(cat => 
    cat.frameworks.map(fw => ({ ...fw, category: cat.name }))
  )
  
  // Get unique categories
  const categoryNames = categories.map(c => c.name)
  
  // Filter frameworks
  const filteredFrameworks = allFrameworks.filter(fw => {
    const matchesSearch = !searchQuery || 
      fw.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fw.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !filterCategory || fw.category === filterCategory
    return matchesSearch && matchesCategory
  })
  
  // Get node counts from framework (now returned by backend)
  const getNodeCounts = (framework: Framework): { tiers: number; labels: number } => {
    return {
      tiers: (framework as any).tierCount || 0,
      labels: (framework as any).labelCount || 0
    }
  }
  
  // Menu handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, fw: Framework) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    setSelectedFramework(fw)
  }
  
  const handleMenuClose = () => {
    setAnchorEl(null)
  }
  
  const handleView = () => {
    if (selectedFramework) {
      onSelect(selectedFramework)
    }
    handleMenuClose()
  }
  
  const handleCopy = async () => {
    if (!selectedFramework) return
    handleMenuClose()
    
    try {
      const response = await frameworkApi.get(selectedFramework.id)
      if (response.data?.success && response.data?.data) {
        const fullFramework = response.data.data
        const copyName = `${fullFramework.name}_copy`
        const copyRoot = JSON.parse(JSON.stringify(fullFramework.root))
        copyRoot.id = crypto.randomUUID()
        copyRoot.name = copyName
        
        await frameworkApi.create({
          name: copyName,
          category: fullFramework.category || 'Customs',
          description: fullFramework.description,
          root: copyRoot
        })
        onRefresh()
      }
    } catch (error) {
      console.error('Failed to copy framework:', error)
    }
  }
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
    handleMenuClose()
  }
  
  const handleDeleteConfirm = async () => {
    if (!selectedFramework) return
    
    try {
      await frameworkApi.delete(selectedFramework.id)
      setDeleteDialogOpen(false)
      setSelectedFramework(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to delete framework:', error)
    }
  }
  
  // Create framework
  const handleCreate = async () => {
    if (!newName.trim()) return
    
    // Determine final category
    const finalCategory = useCustomCategory && customCategory.trim() 
      ? customCategory.trim() 
      : newCategory
    
    try {
      const rootNode: FrameworkNode = {
        id: crypto.randomUUID(),
        name: newName.trim(),
        type: 'tier',
        children: []
      }
      
      const response = await frameworkApi.create({
        name: newName.trim(),
        category: finalCategory,
        description: newDescription.trim() || undefined,
        root: rootNode
      })
      
      if (response.data?.success && response.data?.data) {
        setCreateDialogOpen(false)
        setNewName('')
        setNewDescription('')
        setCustomCategory('')
        setUseCustomCategory(false)
        onRefresh()
        onSelect(response.data.data)
      }
    } catch (error) {
      console.error('Failed to create framework:', error)
    }
  }
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }
  
  // 根据分类名称生成哈希颜色（与 MIPVU 框架颜色深度一致：80-180 区间）
  const generateCategoryColor = (category: string): string => {
    // 简单的字符串哈希函数
    let hash = 0
    for (let i = 0; i < category.length; i++) {
      const char = category.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    
    // 使用哈希值生成 RGB
    const r_raw = Math.abs(hash) % 256
    const g_raw = Math.abs(hash >> 8) % 256
    const b_raw = Math.abs(hash >> 16) % 256
    
    // 映射到 80-180 区间，与 MIPVU 框架颜色深度一致
    const minVal = 80
    const maxVal = 180
    const rangeSize = maxVal - minVal
    
    const r = Math.floor(minVal + (r_raw / 255) * rangeSize)
    const g = Math.floor(minVal + (g_raw / 255) * rangeSize)
    const b = Math.floor(minVal + (b_raw / 255) * rangeSize)
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  
  // 根据分类获取颜色（预置分类用固定颜色，其他用哈希生成）
  const getCategoryColor = (category: string) => {
    const presetColors: Record<string, string> = {
      'Metaphor Analysis': '#8b5cf6',
      'Discourse Analysis': '#3b82f6',
      'Grammar Analysis': '#10b981',
      'Error Analysis': '#f59e0b',
      'Customs': '#6366f1'
    }
    return presetColors[category] || generateCategoryColor(category)
  }

  // Render card view
  const renderCardView = () => (
    <Grid container spacing={2}>
      {filteredFrameworks
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
        .map((framework) => {
          const counts = getNodeCounts(framework)
          const categoryColor = getCategoryColor(framework.category)
          const isCustom = framework.category === 'Customs'
          
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={framework.id}>
              <Card 
                variant="outlined"
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderColor: 'divider',
                  '&:hover': {
                    boxShadow: 3,
                    borderColor: categoryColor
                  }
                }}
                onClick={() => onSelect(framework)}
              >
                {/* 顶部彩色标识条 */}
                <Box sx={{ 
                  height: 4, 
                  bgcolor: categoryColor,
                  borderRadius: '4px 4px 0 0'
                }} />
                
                <CardContent sx={{ pb: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* 标题行 */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography 
                      variant="subtitle1" 
                      fontWeight={600}
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                        minHeight: 40,
                        flex: 1,
                        mr: 1
                      }}
                    >
                      {framework.name}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, framework)}
                      sx={{ mt: -0.5, mr: -0.5 }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  {/* 分类标签 */}
                  <Chip 
                    icon={<FolderIcon sx={{ fontSize: 14 }} />}
                    label={framework.category} 
                    size="small" 
                    sx={{ 
                      mb: 1,
                      height: 22,
                      fontSize: '11px',
                      bgcolor: `${categoryColor}15`,
                      color: categoryColor,
                      borderColor: `${categoryColor}30`,
                      '& .MuiChip-icon': { color: categoryColor }
                    }}
                    variant="outlined"
                  />
                  
                  {/* 描述 */}
                  {framework.description ? (
                    <Typography 
                      variant="caption" 
                      color="text.secondary" 
                      sx={{ 
                        mb: 1.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.4,
                        minHeight: 36
                      }}
                    >
                      {framework.description}
                    </Typography>
                  ) : (
                    <Box sx={{ minHeight: 36, mb: 1.5 }} />
                  )}
                  
                  {/* 统计信息 */}
                  <Box sx={{ 
                    display: 'flex', 
                    gap: 0.5, 
                    flexWrap: 'wrap',
                    flex: 1,
                    alignContent: 'flex-start'
                  }}>
                    <Chip 
                      label={`${t('framework.tiers', '层级')} ${counts.tiers}`}
                      size="small"
                      sx={{ 
                        height: 20, 
                        fontSize: '10px',
                        bgcolor: '#f0f9ff',
                        color: '#0369a1',
                        '& .MuiChip-label': { px: 1 }
                      }}
                    />
                    <Chip 
                      label={`${t('framework.labels', '标签')} ${counts.labels}`}
                      size="small"
                      sx={{ 
                        height: 20, 
                        fontSize: '10px',
                        bgcolor: '#f0fdf4',
                        color: '#16a34a',
                        '& .MuiChip-label': { px: 1 }
                      }}
                    />
                    {isCustom && (
                      <Chip 
                        label={t('framework.editable', '可编辑')}
                        size="small"
                        sx={{ 
                          height: 20, 
                          fontSize: '10px',
                          bgcolor: '#fef3c7',
                          color: '#d97706',
                          '& .MuiChip-label': { px: 1 }
                        }}
                      />
                    )}
                  </Box>
                  
                  {/* 时间 - 底部固定 */}
                  <Typography 
                    variant="caption" 
                    color="text.disabled" 
                    sx={{ mt: 'auto', pt: 1, display: 'block' }}
                  >
                    {formatDate(framework.updatedAt)}
                  </Typography>
                </CardContent>
                
                <CardActions sx={{ justifyContent: 'flex-end', pt: 0, px: 2, pb: 1 }}>
                  <Button 
                    size="small" 
                    variant="text"
                    onClick={(e) => { e.stopPropagation(); onSelect(framework) }}
                    sx={{ fontSize: '12px' }}
                  >
                    {t('common.edit', '编辑')}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          )
        })}
    </Grid>
  )
  
  // Render list view
  const renderListView = () => (
    <TableContainer component={Paper} sx={{ width: '100%' }}>
      <Table sx={{ tableLayout: 'fixed', width: '100%' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: '20%' }}>{t('framework.name', '名称')}</TableCell>
            <TableCell sx={{ width: '12%' }}>{t('framework.category', '分类')}</TableCell>
            <TableCell sx={{ width: '8%' }} align="center">{t('framework.tiers', '层级')}</TableCell>
            <TableCell sx={{ width: '8%' }} align="center">{t('framework.labels', '标签')}</TableCell>
            <TableCell sx={{ width: '30%' }}>{t('framework.description', '描述')}</TableCell>
            <TableCell sx={{ width: '12%' }}>{t('common.updatedAt', '更新时间')}</TableCell>
            <TableCell sx={{ width: '10%' }} align="right"></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredFrameworks
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((framework) => {
              const counts = getNodeCounts(framework)
              return (
                <TableRow
                  key={framework.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onSelect(framework)}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TreeIcon color="primary" fontSize="small" />
                      <Typography fontWeight={500}>{framework.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={framework.category} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">{counts.tiers}</TableCell>
                  <TableCell align="center">{counts.labels}</TableCell>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      color="text.secondary" 
                      noWrap 
                      sx={{ maxWidth: 200 }}
                    >
                      {framework.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(framework.updatedAt)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, framework)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
    </TableContainer>
  )
  
  // Loading skeleton
  if (loading && allFrameworks.length === 0) {
    return (
      <Box sx={{ p: 3, width: '100%', boxSizing: 'border-box' }}>
        <Skeleton variant="rectangular" height={56} sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={180} />
            </Grid>
          ))}
        </Grid>
      </Box>
    )
  }
  
  return (
    <Box sx={{ p: 3, height: '100%', width: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          {t('framework.manager', '框架管理')} ({filteredFrameworks.length})
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, mode) => mode && setViewMode(mode)}
            size="small"
          >
            <ToggleButton value="card">
              <ViewModuleIcon />
            </ToggleButton>
            <ToggleButton value="list">
              <ViewListIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton onClick={onRefresh}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="outlined"
            startIcon={<ImportIcon />}
            onClick={onImport}
          >
            {t('framework.import', '导入')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            {t('framework.create', '新建')}
          </Button>
        </Stack>
      </Box>
      
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            size="small"
            placeholder={t('common.search', '搜索...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ minWidth: 200, flexGrow: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('framework.category', '分类')}</InputLabel>
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              label={t('framework.category', '分类')}
            >
              <MenuItem value="">{t('common.all', '全部')}</MenuItem>
              {categoryNames.map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>
      
      {/* Content */}
      {filteredFrameworks.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <TreeIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchQuery || filterCategory 
              ? t('framework.noSearchResults', '没有找到匹配的框架')
              : t('framework.noFrameworks', '暂无标注框架')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {searchQuery || filterCategory 
              ? t('framework.adjustFilters', '请调整筛选条件')
              : t('framework.createOrImport', '创建或导入一个框架开始使用')}
          </Typography>
          {!searchQuery && !filterCategory && (
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
              >
                {t('framework.create', '新建')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<ImportIcon />}
                onClick={onImport}
              >
                {t('framework.import', '导入')}
              </Button>
            </Stack>
          )}
        </Paper>
      ) : (
        <>
          {viewMode === 'card' ? renderCardView() : renderListView()}
          
          <TablePagination
            component="div"
            count={filteredFrameworks.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
            rowsPerPageOptions={viewMode === 'card' ? [6, 12, 24] : [5, 10, 25]}
            labelRowsPerPage={t('common.rowsPerPage', '每页行数')}
            sx={{ mt: 2 }}
          />
        </>
      )}
      
      {/* Context Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={handleView}>
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('common.edit', '编辑')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleCopy}>
          <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('framework.copy', '复制')}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem 
          onClick={handleDeleteClick} 
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>{t('common.delete', '删除')}</ListItemText>
        </MenuItem>
      </Menu>
      
      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('framework.createNew', '创建新框架')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('framework.name', '框架名称')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>{t('framework.category', '分类')}</InputLabel>
            <Select
              value={useCustomCategory ? '__custom__' : newCategory}
              label={t('framework.category', '分类')}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setUseCustomCategory(true)
                } else {
                  setUseCustomCategory(false)
                  setNewCategory(e.target.value)
                }
              }}
            >
              {categoryNames.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
              <Divider />
              <MenuItem value="__custom__">
                <em>{t('framework.customCategory', '+ 自定义分类')}</em>
              </MenuItem>
            </Select>
          </FormControl>
          {useCustomCategory && (
            <TextField
              fullWidth
              label={t('framework.customCategoryName', '自定义分类名称')}
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              sx={{ mb: 2 }}
              helperText={t('framework.customCategoryHint', '输入新的分类名称，创建后可复用')}
            />
          )}
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t('framework.description', '描述')}
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>
            {t('common.create', '创建')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('common.confirmDelete', '确认删除')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('framework.deleteConfirmMessage', '确定要删除框架 "{name}" 吗？此操作不可撤销。', {
              name: selectedFramework?.name
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            {t('common.delete', '删除')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default FrameworkList

