import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  FileText, 
  MessageSquare, 
  Users, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  Pause, 
  X,
  Plus,
  Edit,
  Trash2,
  Download,
  Upload,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  File,
  User,
  CalendarDays,
  Target,
  BarChart3,
  TrendingUp,
  Activity,
  Save,
  Send,
  MoreHorizontal
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { firestore } from '@/lib/firebase';
import { 
  doc, 
  updateDoc, 
  addDoc, 
  collection, 
  serverTimestamp, 
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { formatDateSafe } from '@/utils/formatDateSafe';

interface VerDetallesProyectoProps {
  proyecto: any;
  onClose: () => void;
  onUpdate?: (proyecto: any) => void;
}

const ESTADOS_FASE = [
  { value: 'Pendiente', label: 'Pendiente', color: 'bg-gray-500' },
  { value: 'En Progreso', label: 'En Progreso', color: 'bg-blue-500' },
  { value: 'En Revisión', label: 'En Revisión', color: 'bg-yellow-500' },
  { value: 'Aprobada', label: 'Aprobada', color: 'bg-green-500' },
  { value: 'Bloqueada', label: 'Bloqueada', color: 'bg-red-500' },
  { value: 'Terminado', label: 'Terminado', color: 'bg-purple-500' },
];

const ESTADOS_TAREA = [
  { value: 'pending', label: 'Pendiente', color: 'bg-gray-500' },
  { value: 'in_progress', label: 'En Progreso', color: 'bg-blue-500' },
  { value: 'review', label: 'En Revisión', color: 'bg-yellow-500' },
  { value: 'completed', label: 'Completada', color: 'bg-green-500' },
  { value: 'blocked', label: 'Bloqueada', color: 'bg-red-500' },
];

export default function VerDetallesProyecto({ proyecto, onClose, onUpdate }: VerDetallesProyectoProps) {
  const { user } = useApp();
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedFases, setExpandedFases] = useState<Set<string>>(new Set());
  const [expandedTareas, setExpandedTareas] = useState<Set<string>>(new Set());
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [nuevaTarea, setNuevaTarea] = useState({
    titulo: '',
    descripcion: '',
    responsable: '',
    fechaLimite: '',
    prioridad: 'media'
  });
  const [editandoTarea, setEditandoTarea] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editandoProyecto, setEditandoProyecto] = useState(false);
  const [datosProyecto, setDatosProyecto] = useState({
    presupuesto: proyecto?.presupuesto || '',
    cliente: proyecto?.cliente || '',
    fechaEntrega: proyecto?.fechaEntrega || ''
  });
  
  // Estados para gestión de fases
  const [proyectoLocal, setProyectoLocal] = useState(proyecto);
  const [editandoFase, setEditandoFase] = useState<string | null>(null);
  const [nuevaFase, setNuevaFase] = useState({
    descripcion: '',
    fechaInicio: '',
    fechaFin: '',
    estado: 'Pendiente'
  });
  const [faseEditando, setFaseEditando] = useState({
    descripcion: '',
    fechaInicio: '',
    fechaFin: '',
    estado: 'Pendiente'
  });

  // Validar que el proyecto existe
  if (!proyecto || !proyecto.id) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-gray-600 mb-4">No se pudo cargar la información del proyecto.</p>
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      </div>
    );
  }

  // Actualizar proyectoLocal cuando cambie el prop proyecto
  useEffect(() => {
    setProyectoLocal(proyecto);
  }, [proyecto]);

  // Actualizar datos del proyecto cuando cambie proyectoLocal
  useEffect(() => {
    if (proyectoLocal) {
      setDatosProyecto({
        presupuesto: proyectoLocal.presupuesto || '',
        cliente: proyectoLocal.cliente || '',
        fechaEntrega: proyectoLocal.fechaEntrega || ''
      });
    }
  }, [proyectoLocal]);

  // Cargar archivos del proyecto
  useEffect(() => {
    const cargarArchivos = async () => {
      try {
        const archivosRef = collection(firestore, 'projects', proyecto.id, 'archivos');
        const q = query(archivosRef, orderBy('fechaSubida', 'desc'));
        const snapshot = await getDocs(q);
        const archivosData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setArchivos(archivosData);
      } catch (error) {
        console.error('Error cargando archivos:', error);
      }
    };

    if (proyecto && proyecto.id) {
      cargarArchivos();
    }
  }, [proyecto?.id]);

  const toggleFase = (faseKey: string) => {
    const newExpanded = new Set(expandedFases);
    if (newExpanded.has(faseKey)) {
      newExpanded.delete(faseKey);
    } else {
      newExpanded.add(faseKey);
    }
    setExpandedFases(newExpanded);
  };

  const toggleTareas = (faseKey: string) => {
    const newExpanded = new Set(expandedTareas);
    if (newExpanded.has(faseKey)) {
      newExpanded.delete(faseKey);
    } else {
      newExpanded.add(faseKey);
    }
    setExpandedTareas(newExpanded);
  };

  const handleEstadoFase = async (faseKey: string, nuevoEstado: string) => {
    if (!user || user.role !== 'admin' || !proyecto?.id) return;

    try {
      setLoading(true);
      const proyectoRef = doc(firestore, 'projects', proyecto.id);
      const nuevasFases = (proyectoLocal.fases || []).map((f: any) =>
        f.key === faseKey
          ? {
              ...f,
              estado: nuevoEstado,
              ultimoCambio: { 
                usuario: user.email, 
                fecha: new Date().toISOString() 
              }
            }
          : f
      );

      await updateDoc(proyectoRef, { fases: nuevasFases });
      
      // Actualizar estado local inmediatamente
      const proyectoActualizado = { ...proyectoLocal, fases: nuevasFases };
      setProyectoLocal(proyectoActualizado);
      onUpdate?.(proyectoActualizado);
      
      toast({
        title: "Estado actualizado",
        description: `Fase ${faseKey} actualizada a ${nuevoEstado}`,
      });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado de la fase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAgregarComentario = async (faseKey: string) => {
    if (!nuevoComentario.trim() || !user || !proyecto?.id) return;

    try {
      setLoading(true);
      const comentariosRef = collection(firestore, 'projects', proyecto.id, 'fases', faseKey, 'comentarios');
      await addDoc(comentariosRef, {
        contenido: nuevoComentario,
        usuario: user.email,
        fecha: serverTimestamp(),
        tipo: 'comentario'
      });

      setNuevoComentario('');
      toast({
        title: "Comentario agregado",
        description: "El comentario se agregó correctamente",
      });
    } catch (error) {
      console.error('Error agregando comentario:', error);
      toast({
        title: "Error",
        description: "No se pudo agregar el comentario",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAgregarTarea = async (faseKey: string) => {
    if (!nuevaTarea.titulo.trim() || !user || !proyecto?.id) return;

    try {
      setLoading(true);
      const tareasRef = collection(firestore, 'projects', proyecto.id, 'fases', faseKey, 'tareas');
      await addDoc(tareasRef, {
        titulo: nuevaTarea.titulo,
        descripcion: nuevaTarea.descripcion,
        responsable: nuevaTarea.responsable,
        fechaLimite: nuevaTarea.fechaLimite,
        prioridad: nuevaTarea.prioridad,
        status: 'pending',
        creadoPor: user.email,
        fechaCreacion: serverTimestamp()
      });

      setNuevaTarea({
        titulo: '',
        descripcion: '',
        responsable: '',
        fechaLimite: '',
        prioridad: 'media'
      });

      toast({
        title: "Tarea agregada",
        description: "La tarea se agregó correctamente",
      });
    } catch (error) {
      console.error('Error agregando tarea:', error);
      toast({
        title: "Error",
        description: "No se pudo agregar la tarea",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActualizarTarea = async (tareaId: string, updates: any) => {
    if (!proyecto?.id) return;

    try {
      setLoading(true);
      // Aquí actualizarías la tarea en Firestore
      toast({
        title: "Tarea actualizada",
        description: "La tarea se actualizó correctamente",
      });
    } catch (error) {
      console.error('Error actualizando tarea:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la tarea",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarTarea = async (tareaId: string) => {
    if (!proyecto?.id) return;

    try {
      setLoading(true);
      // Aquí eliminarías la tarea de Firestore
      toast({
        title: "Tarea eliminada",
        description: "La tarea se eliminó correctamente",
      });
    } catch (error) {
      console.error('Error eliminando tarea:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la tarea",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Funciones para gestión de fases
  const handleAgregarFase = async () => {
    if (!nuevaFase.descripcion.trim() || !user || user.role !== 'admin' || !proyecto?.id) return;

    try {
      setLoading(true);
      const proyectoRef = doc(firestore, 'projects', proyecto.id);
      const faseKey = `fase_${Date.now()}`;
      const nuevaFaseCompleta = {
        key: faseKey,
        descripcion: nuevaFase.descripcion,
        fechaInicio: nuevaFase.fechaInicio,
        fechaFin: nuevaFase.fechaFin,
        estado: nuevaFase.estado,
        tareas: [],
        comentarios: [],
        creadoPor: user.email,
        fechaCreacion: new Date().toISOString()
      };

      const fasesActualizadas = [...(proyectoLocal.fases || []), nuevaFaseCompleta];
      await updateDoc(proyectoRef, { fases: fasesActualizadas });
      
      // Actualizar estado local
      const proyectoActualizado = { ...proyectoLocal, fases: fasesActualizadas };
      setProyectoLocal(proyectoActualizado);
      onUpdate?.(proyectoActualizado);
      
      // Limpiar formulario
      setNuevaFase({
        descripcion: '',
        fechaInicio: '',
        fechaFin: '',
        estado: 'Pendiente'
      });

      toast({
        title: "Fase agregada",
        description: "La fase se agregó correctamente",
      });
    } catch (error) {
      console.error('Error agregando fase:', error);
      toast({
        title: "Error",
        description: "No se pudo agregar la fase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditarFase = async (faseKey: string) => {
    if (!user || user.role !== 'admin' || !proyecto?.id) return;

    try {
      setLoading(true);
      const proyectoRef = doc(firestore, 'projects', proyecto.id);
      const fasesActualizadas = (proyectoLocal.fases || []).map((f: any) =>
        f.key === faseKey
          ? {
              ...f,
              descripcion: faseEditando.descripcion,
              fechaInicio: faseEditando.fechaInicio,
              fechaFin: faseEditando.fechaFin,
              estado: faseEditando.estado,
              ultimaModificacion: {
                usuario: user.email,
                fecha: new Date().toISOString()
              }
            }
          : f
      );

      await updateDoc(proyectoRef, { fases: fasesActualizadas });
      
      // Actualizar estado local
      const proyectoActualizado = { ...proyectoLocal, fases: fasesActualizadas };
      setProyectoLocal(proyectoActualizado);
      onUpdate?.(proyectoActualizado);
      
      // Salir del modo edición
      setEditandoFase(null);
      setFaseEditando({
        descripcion: '',
        fechaInicio: '',
        fechaFin: '',
        estado: 'Pendiente'
      });

      toast({
        title: "Fase actualizada",
        description: "La fase se actualizó correctamente",
      });
    } catch (error) {
      console.error('Error actualizando fase:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la fase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarFase = async (faseKey: string) => {
    if (!user || user.role !== 'admin' || !proyecto?.id) return;

    try {
      setLoading(true);
      const proyectoRef = doc(firestore, 'projects', proyecto.id);
      const fasesActualizadas = (proyectoLocal.fases || []).filter((f: any) => f.key !== faseKey);

      await updateDoc(proyectoRef, { fases: fasesActualizadas });
      
      // Actualizar estado local
      const proyectoActualizado = { ...proyectoLocal, fases: fasesActualizadas };
      setProyectoLocal(proyectoActualizado);
      onUpdate?.(proyectoActualizado);

      toast({
        title: "Fase eliminada",
        description: "La fase se eliminó correctamente",
      });
    } catch (error) {
      console.error('Error eliminando fase:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la fase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const iniciarEdicionFase = (fase: any) => {
    setEditandoFase(fase.key);
    setFaseEditando({
      descripcion: fase.descripcion || '',
      fechaInicio: fase.fechaInicio || '',
      fechaFin: fase.fechaFin || '',
      estado: fase.estado || 'Pendiente'
    });
  };

  const handleGuardarProyecto = async () => {
    if (!proyecto?.id) return;

    try {
      setLoading(true);
      const proyectoRef = doc(firestore, 'projects', proyecto.id);
      await updateDoc(proyectoRef, {
        presupuesto: datosProyecto.presupuesto,
        cliente: datosProyecto.cliente,
        fechaEntrega: datosProyecto.fechaEntrega,
        actualizadoEn: serverTimestamp()
      });

      const proyectoActualizado = { 
        ...proyecto, 
        presupuesto: datosProyecto.presupuesto,
        cliente: datosProyecto.cliente,
        fechaEntrega: datosProyecto.fechaEntrega
      };
      onUpdate?.(proyectoActualizado);
      setEditandoProyecto(false);

      toast({
        title: "Proyecto actualizado",
        description: "Los datos del proyecto se guardaron correctamente",
      });
    } catch (error) {
      console.error('Error guardando proyecto:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el proyecto",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calcularProgresoFase = (faseKey: string) => {
    const fase = proyectoLocal.fases?.find((f: any) => f.key === faseKey);
    if (!fase || !fase.tareas) return 0;
    
    const tareasCompletadas = fase.tareas.filter((t: any) => t.status === 'completed').length;
    return fase.tareas.length > 0 ? Math.round((tareasCompletadas / fase.tareas.length) * 100) : 0;
  };

  const calcularProgresoProyecto = () => {
    if (!proyectoLocal.fases || proyectoLocal.fases.length === 0) return 0;
    
    const progresoTotal = proyectoLocal.fases.reduce((acc: number, fase: any) => {
      return acc + calcularProgresoFase(fase.key);
    }, 0);
    
    return Math.round(progresoTotal / proyectoLocal.fases.length);
  };

  const getStatusColor = (estado: string) => {
    const estadoObj = ESTADOS_FASE.find(e => e.value === estado);
    return estadoObj ? estadoObj.color : 'bg-gray-500';
  };

  const getTareaStatusColor = (status: string) => {
    const statusObj = ESTADOS_TAREA.find(s => s.value === status);
    return statusObj ? statusObj.color : 'bg-gray-500';
  };

  const renderFases = () => {
    const fases = proyectoLocal.fases || [];
    
    return (
      <div className="space-y-6">
        {/* Formulario para agregar nueva fase */}
        {user?.role === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Plus className="h-5 w-5 text-blue-400" />
                Agregar Nueva Fase
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Descripción de la fase"
                    value={nuevaFase.descripcion}
                    onChange={(e) => setNuevaFase({...nuevaFase, descripcion: e.target.value})}
                    className="text-white placeholder-gray-400"
                  />
                  <Select 
                    value={nuevaFase.estado} 
                    onValueChange={(value) => setNuevaFase({...nuevaFase, estado: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_FASE.map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    placeholder="Fecha de inicio"
                    value={nuevaFase.fechaInicio}
                    onChange={(e) => setNuevaFase({...nuevaFase, fechaInicio: e.target.value})}
                    className="text-white placeholder-gray-400"
                  />
                  <Input
                    type="date"
                    placeholder="Fecha de fin"
                    value={nuevaFase.fechaFin}
                    onChange={(e) => setNuevaFase({...nuevaFase, fechaFin: e.target.value})}
                    className="text-white placeholder-gray-400"
                  />
                </div>
                <Button 
                  onClick={handleAgregarFase}
                  disabled={!nuevaFase.descripcion.trim() || loading}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Fase
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {fases.map((fase: any) => {
          const progreso = calcularProgresoFase(fase.key);
          const isExpanded = expandedFases.has(fase.key);
          const tareasExpanded = expandedTareas.has(fase.key);
          
          return (
            <Card key={fase.key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFase(fase.key)}
                      className="p-1"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <div>
                      <CardTitle className="text-lg text-white">{fase.descripcion}</CardTitle>
                      <p className="text-sm text-gray-300">Clave: {fase.key}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {user?.role === 'admin' && (
                      <Select 
                        value={fase.estado} 
                        onValueChange={(value) => handleEstadoFase(fase.key, value)}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS_FASE.map((estado) => (
                            <SelectItem key={estado.value} value={estado.value}>
                              {estado.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    
                    {user?.role === 'admin' && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => iniciarEdicionFase(fase)}
                          className="p-1"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarFase(fase.key)}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    
                    <div className="text-right">
                      <div className="text-sm font-medium text-white">{progreso}%</div>
                      <Progress value={progreso} className="w-20 h-2" />
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="space-y-4">
                  {/* Formulario de edición de fase */}
                  {editandoFase === fase.key && user?.role === 'admin' && (
                    <Card className="p-4 border border-blue-500">
                      <div className="space-y-3">
                        <h4 className="font-medium text-white">Editar Fase</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            placeholder="Descripción de la fase"
                            value={faseEditando.descripcion}
                            onChange={(e) => setFaseEditando({...faseEditando, descripcion: e.target.value})}
                            className="text-white placeholder-gray-400"
                          />
                          <Select 
                            value={faseEditando.estado} 
                            onValueChange={(value) => setFaseEditando({...faseEditando, estado: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ESTADOS_FASE.map((estado) => (
                                <SelectItem key={estado.value} value={estado.value}>
                                  {estado.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            placeholder="Fecha de inicio"
                            value={faseEditando.fechaInicio}
                            onChange={(e) => setFaseEditando({...faseEditando, fechaInicio: e.target.value})}
                            className="text-white placeholder-gray-400"
                          />
                          <Input
                            type="date"
                            placeholder="Fecha de fin"
                            value={faseEditando.fechaFin}
                            onChange={(e) => setFaseEditando({...faseEditando, fechaFin: e.target.value})}
                            className="text-white placeholder-gray-400"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleEditarFase(fase.key)}
                            disabled={!faseEditando.descripcion.trim() || loading}
                            size="sm"
                          >
                            Guardar
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setEditandoFase(null)}
                            size="sm"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                  
                  {/* Comentarios */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-white">Comentarios</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTareas(fase.key)}
                        className="p-1"
                      >
                        {tareasExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Tareas
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Agregar comentario..."
                          value={nuevoComentario}
                          onChange={(e) => setNuevoComentario(e.target.value)}
                          className="flex-1"
                        />
                        <Button 
                          onClick={() => handleAgregarComentario(fase.key)}
                          disabled={!nuevoComentario.trim() || loading}
                          size="sm"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Tareas */}
                  {tareasExpanded && (
                                         <div className="space-y-3">
                       <h4 className="font-medium text-white">Tareas</h4>
                      
                                             {/* Agregar nueva tarea */}
                       <Card className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            placeholder="Título de la tarea"
                            value={nuevaTarea.titulo}
                            onChange={(e) => setNuevaTarea({...nuevaTarea, titulo: e.target.value})}
                          />
                          <Input
                            placeholder="Responsable"
                            value={nuevaTarea.responsable}
                            onChange={(e) => setNuevaTarea({...nuevaTarea, responsable: e.target.value})}
                          />
                          <Input
                            type="date"
                            value={nuevaTarea.fechaLimite}
                            onChange={(e) => setNuevaTarea({...nuevaTarea, fechaLimite: e.target.value})}
                          />
                          <Select 
                            value={nuevaTarea.prioridad} 
                            onValueChange={(value) => setNuevaTarea({...nuevaTarea, prioridad: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="baja">Baja</SelectItem>
                              <SelectItem value="media">Media</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Textarea
                          placeholder="Descripción de la tarea"
                          value={nuevaTarea.descripcion}
                          onChange={(e) => setNuevaTarea({...nuevaTarea, descripcion: e.target.value})}
                          className="mt-3"
                        />
                        <Button 
                          onClick={() => handleAgregarTarea(fase.key)}
                          disabled={!nuevaTarea.titulo.trim() || loading}
                          className="mt-3"
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Agregar Tarea
                        </Button>
                      </Card>

                                               {/* Lista de tareas */}
                         <div className="space-y-2">
                           {(fase.tareas || []).map((tarea: any) => (
                             <Card key={tarea.id} className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                                                 <div className="font-medium text-white">{tarea.titulo}</div>
                                 <div className="text-sm text-gray-300">{tarea.descripcion}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">{tarea.responsable}</Badge>
                                  <Badge variant="outline" className="text-xs">{tarea.prioridad}</Badge>
                                  <Badge className={`text-xs ${getTareaStatusColor(tarea.status)}`}>
                                    {ESTADOS_TAREA.find(s => s.value === tarea.status)?.label}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  const renderArchivos = () => {
    return (
      <div className="space-y-6">
                 <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2 text-white">
               <FileText className="h-5 w-5 text-blue-400" />
               Archivos del Proyecto
             </CardTitle>
           </CardHeader>
           <CardContent>
             {archivos.length === 0 ? (
               <div className="text-center py-8">
                 <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                 <p className="text-gray-300">No hay archivos subidos aún</p>
               </div>
             ) : (
               <div className="space-y-2">
                 {archivos.map((archivo) => (
                   <div key={archivo.id} className="flex items-center justify-between p-3 border rounded-lg">
                     <div className="flex items-center gap-3">
                       <File className="h-5 w-5 text-blue-400" />
                       <div>
                         <div className="font-medium text-white">{archivo.nombre}</div>
                         <div className="text-sm text-gray-300">
                           {formatDateSafe(archivo.fechaSubida)}
                         </div>
                       </div>
                     </div>
                     <Button variant="ghost" size="sm">
                       <Download className="h-4 w-4" />
                     </Button>
                   </div>
                 ))}
               </div>
             )}
           </CardContent>
         </Card>
      </div>
    );
  };

  const renderMetricas = () => {
    const fases = proyectoLocal.fases || [];
    const tareas = fases.flatMap((f: any) => f.tareas || []);
    const comentarios = fases.flatMap((f: any) => f.comentarios || []);
    
  return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Progreso General
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  {calcularProgresoProyecto()}%
                </div>
                <Progress value={calcularProgresoProyecto()} className="h-3" />
                <p className="text-sm text-gray-600 mt-2">
                  {fases.length} fases • {tareas.length} tareas
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Actividad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Fases Completadas</span>
                  <span className="font-medium">
                    {fases.filter((f: any) => f.estado === 'Terminado').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Tareas Pendientes</span>
                  <span className="font-medium">
                    {tareas.filter((t: any) => t.status !== 'completed').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Comentarios</span>
                  <span className="font-medium">{comentarios.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Rendimiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Tareas Completadas</span>
                  <span className="font-medium">
                    {tareas.filter((t: any) => t.status === 'completed').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Tareas en Progreso</span>
                  <span className="font-medium">
                    {tareas.filter((t: any) => t.status === 'in_progress').length}
                  </span>
            </div>
                <div className="flex justify-between">
                  <span className="text-sm">Tareas Bloqueadas</span>
                  <span className="font-medium">
                    {tareas.filter((t: any) => t.status === 'blocked').length}
                  </span>
            </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen de Fases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {fases.map((fase: any) => {
                  const progreso = calcularProgresoFase(fase.key);
                  return (
                    <div key={fase.key} className="flex items-center justify-between">
                      <span className="text-sm">{fase.descripcion}</span>
              <div className="flex items-center gap-2">
                        <Progress value={progreso} className="w-20 h-2" />
                        <span className="text-sm font-medium">{progreso}%</span>
              </div>
            </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actividad Reciente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Proyecto iniciado</span>
                  <span className="text-gray-500 ml-auto">{formatDateSafe(proyecto.createdAt || proyecto.fechaInicio)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>{comentarios.length} comentarios agregados</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>{tareas.length} tareas creadas</span>
            </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-purple-900 rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div>
            <h2 className="text-2xl font-bold text-white">{proyecto.name || proyecto.nombre}</h2>
            <p className="text-white/90">{proyecto.description || proyecto.descripcion}</p>
            </div>
          <div className="flex items-center gap-3">
            <Button onClick={onClose} variant="ghost" size="sm" className="text-white hover:bg-white/20">
              <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <div className="border-b-2 border-black px-6 bg-purple-800">
              <TabsList className="grid w-full grid-cols-4 bg-purple-700 border border-purple-600">
                <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white hover:bg-purple-600">
                  Vista General
                </TabsTrigger>
                <TabsTrigger value="fases" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white hover:bg-purple-600">
                  Fases y Tareas
                </TabsTrigger>
                <TabsTrigger value="files" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white hover:bg-purple-600">
                  Archivos
                </TabsTrigger>
                <TabsTrigger value="metrics" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white hover:bg-purple-600">
                  Métricas
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)] bg-purple-900">
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <FileText className="h-5 w-5 text-blue-400" />
                        Información del Proyecto
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">Fecha de inicio: {formatDateSafe(proyecto.createdAt || proyecto.fechaInicio)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">Fecha de entrega: {formatDateSafe(proyecto.fechaEntrega) || 'Fecha no disponible'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">Presupuesto: ${datosProyecto.presupuesto || 'No definido'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">Cliente: {datosProyecto.cliente || 'No definido'}</span>
                      </div>
                      {user?.role === 'admin' && (
                        <Button 
                          onClick={() => setEditandoProyecto(!editandoProyecto)}
                          variant="outline" 
                          size="sm"
                          className="mt-2"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          {editandoProyecto ? 'Cancelar' : 'Editar'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                                    <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <BarChart3 className="h-5 w-5 text-blue-400" />
                        Progreso General
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center">
                        <div className="text-4xl font-bold text-blue-400 mb-2">
                          {calcularProgresoProyecto()}%
                        </div>
                        <Progress value={calcularProgresoProyecto()} className="h-3" />
                        <p className="text-sm text-gray-300 mt-2">
                          {proyecto.fases?.length || 0} fases • {(proyecto.fases || []).reduce((acc: number, fase: any) => acc + (fase.tareas?.length || 0), 0)} tareas
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                                </div>

                                {/* Formulario de edición */}
                {editandoProyecto && user?.role === 'admin' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-white">Editar Información del Proyecto</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="presupuesto" className="text-white">Presupuesto</Label>
                          <Input
                            id="presupuesto"
                            type="number"
                            placeholder="Ingrese el presupuesto"
                            value={datosProyecto.presupuesto}
                            onChange={(e) => setDatosProyecto({...datosProyecto, presupuesto: e.target.value})}
                            className="text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <Label htmlFor="cliente" className="text-white">Cliente</Label>
                          <Input
                            id="cliente"
                            placeholder="Nombre del cliente"
                            value={datosProyecto.cliente}
                            onChange={(e) => setDatosProyecto({...datosProyecto, cliente: e.target.value})}
                            className="text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <Label htmlFor="fechaEntrega" className="text-white">Fecha de Entrega</Label>
                          <Input
                            id="fechaEntrega"
                            type="date"
                            value={datosProyecto.fechaEntrega}
                            onChange={(e) => setDatosProyecto({...datosProyecto, fechaEntrega: e.target.value})}
                            className="text-white placeholder-gray-400"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button 
                          onClick={handleGuardarProyecto}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Guardar Cambios
                        </Button>
                        <Button 
                          onClick={() => setEditandoProyecto(false)}
                          variant="outline"
                          className="text-white"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Activity className="h-5 w-5 text-blue-400" />
                      Fases del Proyecto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(proyecto.fases || []).map((fase: any) => (
                        <div key={fase.key} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <div className="font-medium text-white">{fase.descripcion}</div>
                            <div className="text-sm text-gray-300">Clave: {fase.key}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={getStatusColor(fase.estado)}>{fase.estado}</Badge>
                            <div className="text-right">
                              <div className="text-sm font-medium text-white">{calcularProgresoFase(fase.key)}%</div>
                              <Progress value={calcularProgresoFase(fase.key)} className="w-20 h-2" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="fases" className="space-y-6">
                {renderFases()}
              </TabsContent>

              <TabsContent value="files" className="space-y-6">
                {renderArchivos()}
              </TabsContent>

              <TabsContent value="metrics" className="space-y-6">
                {renderMetricas()}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
} 