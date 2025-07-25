import { firestore } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp
} from 'firebase/firestore';
import { notificationService } from './notificationService';

export interface TicketEscalation {
  id: string;
  ticketId: string;
  escalatedFrom: string;
  escalatedTo: string;
  reason: string;
  escalationType: 'time' | 'priority' | 'stage' | 'custom' | 'manual';
  escalatedAt: string;
  resolvedAt?: string;
  notes: string;
  actions: EscalationAction[];
  status: 'active' | 'resolved' | 'cancelled';
}

export interface EscalationAction {
  id: string;
  type: 'notify' | 'assign' | 'update_stage' | 'update_priority' | 'create_task' | 'send_email';
  executedAt: string;
  status: 'pending' | 'completed' | 'failed';
  parameters: Record<string, any>;
  result?: any;
}

export interface EscalationRule {
  id: string;
  name: string;
  description: string;
  trigger: 'time' | 'priority' | 'stage' | 'custom';
  conditions: EscalationCondition[];
  actions: EscalationActionConfig[];
  delay: number; // en minutos
  priority: number;
  isActive: boolean;
  escalationLevel: number;
  targetUsers?: string[];
  targetTeam?: string;
  notificationTemplate?: string;
}

export interface EscalationCondition {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
  timeField?: string; // para condiciones de tiempo
}

export interface EscalationActionConfig {
  id: string;
  type: 'notify' | 'assign' | 'update_stage' | 'update_priority' | 'create_task' | 'send_email';
  parameters: Record<string, any>;
  delay?: number; // retraso específico para esta acción
  retryCount?: number;
  retryDelay?: number;
}

export interface TicketData {
  id: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  stage: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
  clientId: string;
  category: string;
  tags: string[];
  timeInStage: number; // minutos
  timeSinceCreation: number; // minutos
  responseTime: number; // minutos
  escalationCount: number;
}

class TicketEscalationService {
  private escalationRules: EscalationRule[] = [];
  private activeEscalations: Map<string, TicketEscalation> = new Map();

  constructor() {
    this.loadEscalationRules();
    this.startEscalationMonitoring();
  }

  // Cargar reglas de escalación
  private async loadEscalationRules() {
    try {
      const snapshot = await getDocs(collection(firestore, 'escalationRules'));
      this.escalationRules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EscalationRule));
    } catch (error) {
      console.error('Error loading escalation rules:', error);
    }
  }

  // Iniciar monitoreo de escalación
  private startEscalationMonitoring() {
    // Monitorear tickets cada 5 minutos
    setInterval(async () => {
      await this.checkEscalations();
    }, 5 * 60 * 1000);
  }

  // Verificar escalaciones
  public async checkEscalations(): Promise<void> {
    try {
      // Obtener tickets activos
      const activeTicketsQuery = query(
        collection(firestore, 'tickets'),
        where('status', 'in', ['new', 'in_progress', 'waiting'])
      );
      const activeTicketsSnapshot = await getDocs(activeTicketsQuery);

      for (const ticketDoc of activeTicketsSnapshot.docs) {
        const ticketData = { id: ticketDoc.id, ...ticketDoc.data() } as TicketData;
        await this.checkTicketEscalation(ticketData);
      }
    } catch (error) {
      console.error('Error checking escalations:', error);
    }
  }

  // Verificar escalación de un ticket específico
  private async checkTicketEscalation(ticketData: TicketData): Promise<void> {
    try {
      // Ordenar reglas por prioridad y nivel de escalación
      const sortedRules = this.escalationRules
        .filter(rule => rule.isActive)
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return a.escalationLevel - b.escalationLevel;
        });

      for (const rule of sortedRules) {
        // Verificar si la regla aplica al ticket
        const shouldEscalate = rule.conditions.every(condition => {
          return this.evaluateCondition(ticketData, condition);
        });

        if (shouldEscalate) {
          // Verificar si ya existe una escalación activa para este ticket
          const existingEscalation = await this.getActiveEscalation(ticketData.id);
          
          if (!existingEscalation || existingEscalation.escalationType !== rule.trigger) {
            await this.executeEscalation(ticketData, rule);
          }
        }
      }
    } catch (error) {
      console.error('Error checking ticket escalation:', error);
    }
  }

  // Ejecutar escalación
  private async executeEscalation(ticketData: TicketData, rule: EscalationRule): Promise<void> {
    try {
      // Crear registro de escalación
      const escalation: Omit<TicketEscalation, 'id'> = {
        ticketId: ticketData.id,
        escalatedFrom: ticketData.assignedTo,
        escalatedTo: '', // Se determinará según las acciones
        reason: `Escalación automática: ${rule.name}`,
        escalationType: rule.trigger,
        escalatedAt: new Date().toISOString(),
        notes: rule.description,
        actions: [],
        status: 'active'
      };

      const escalationRef = await addDoc(collection(firestore, 'ticketEscalations'), escalation);
      const escalationId = escalationRef.id;

      // Ejecutar acciones de escalación
      for (const actionConfig of rule.actions) {
        await this.executeEscalationAction(escalationId, ticketData, actionConfig);
      }

      // Actualizar el ticket
      await updateDoc(doc(firestore, 'tickets', ticketData.id), {
        escalationCount: (ticketData.escalationCount || 0) + 1,
        lastEscalation: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Enviar notificaciones
      await this.sendEscalationNotifications(ticketData, rule);

    } catch (error) {
      console.error('Error executing escalation:', error);
    }
  }

  // Ejecutar acción de escalación
  private async executeEscalationAction(
    escalationId: string, 
    ticketData: TicketData, 
    actionConfig: EscalationActionConfig
  ): Promise<void> {
    try {
      const action: Omit<EscalationAction, 'id'> = {
        type: actionConfig.type,
        executedAt: new Date().toISOString(),
        status: 'pending',
        parameters: actionConfig.parameters
      };

      // Agregar acción a la escalación
      const escalationRef = doc(firestore, 'ticketEscalations', escalationId);
      const escalationDoc = await getDoc(escalationRef);
      const escalationData = escalationDoc.data() as TicketEscalation;
      
      const updatedActions = [...escalationData.actions, action];
      await updateDoc(escalationRef, { actions: updatedActions });

      // Ejecutar la acción
      let result;
      switch (actionConfig.type) {
        case 'notify':
          result = await this.executeNotifyAction(ticketData, actionConfig.parameters);
          break;
        case 'assign':
          result = await this.executeAssignAction(ticketData, actionConfig.parameters);
          break;
        case 'update_stage':
          result = await this.executeUpdateStageAction(ticketData, actionConfig.parameters);
          break;
        case 'update_priority':
          result = await this.executeUpdatePriorityAction(ticketData, actionConfig.parameters);
          break;
        case 'create_task':
          result = await this.executeCreateTaskAction(ticketData, actionConfig.parameters);
          break;
        case 'send_email':
          result = await this.executeSendEmailAction(ticketData, actionConfig.parameters);
          break;
      }

      // Actualizar estado de la acción
      const actionIndex = updatedActions.length - 1;
      updatedActions[actionIndex] = {
        ...updatedActions[actionIndex],
        status: result ? 'completed' : 'failed',
        result
      };

      await updateDoc(escalationRef, { actions: updatedActions });

    } catch (error) {
      console.error('Error executing escalation action:', error);
    }
  }

  // Ejecutar acción de notificación
  private async executeNotifyAction(ticketData: TicketData, parameters: any): Promise<boolean> {
    try {
      const recipients = parameters.recipients || ['managers'];
      const message = parameters.message || `Ticket ${ticketData.id} ha sido escalado`;

      await notificationService.sendNotification({
        type: 'warning',
        title: 'Ticket Escalado',
        message,
        recipients,
        metadata: {
          ticketId: ticketData.id,
          priority: ticketData.priority
        }
      });

      return true;
    } catch (error) {
      console.error('Error executing notify action:', error);
      return false;
    }
  }

  // Ejecutar acción de asignación
  private async executeAssignAction(ticketData: TicketData, parameters: any): Promise<boolean> {
    try {
      const newAssignee = parameters.userId || parameters.team;
      
      if (newAssignee) {
        await updateDoc(doc(firestore, 'tickets', ticketData.id), {
          assignedTo: newAssignee,
          updatedAt: new Date().toISOString()
        });

        // Registrar la nueva asignación
        await addDoc(collection(firestore, 'ticketAssignments'), {
          ticketId: ticketData.id,
          assignedTo: newAssignee,
          assignedBy: 'system',
          assignmentType: 'escalation',
          reason: 'Reasignación por escalación',
          assignedAt: new Date().toISOString(),
          priority: ticketData.priority
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error executing assign action:', error);
      return false;
    }
  }

  // Ejecutar acción de actualización de etapa
  private async executeUpdateStageAction(ticketData: TicketData, parameters: any): Promise<boolean> {
    try {
      const newStage = parameters.stage;
      
      if (newStage) {
        await updateDoc(doc(firestore, 'tickets', ticketData.id), {
          stage: newStage,
          updatedAt: new Date().toISOString()
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error executing update stage action:', error);
      return false;
    }
  }

  // Ejecutar acción de actualización de prioridad
  private async executeUpdatePriorityAction(ticketData: TicketData, parameters: any): Promise<boolean> {
    try {
      const newPriority = parameters.priority;
      
      if (newPriority && ['low', 'medium', 'high', 'critical'].includes(newPriority)) {
        await updateDoc(doc(firestore, 'tickets', ticketData.id), {
          priority: newPriority,
          updatedAt: new Date().toISOString()
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error executing update priority action:', error);
      return false;
    }
  }

  // Ejecutar acción de creación de tarea
  private async executeCreateTaskAction(ticketData: TicketData, parameters: any): Promise<boolean> {
    try {
      const task = {
        title: parameters.title || `Seguimiento de ticket ${ticketData.id}`,
        description: parameters.description || `Ticket escalado: ${ticketData.subject}`,
        assignedTo: parameters.assignedTo || ticketData.assignedTo,
        priority: parameters.priority || ticketData.priority,
        dueDate: parameters.dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        relatedTicket: ticketData.id,
        createdAt: new Date().toISOString(),
        status: 'pending'
      };

      await addDoc(collection(firestore, 'tasks'), task);
      return true;
    } catch (error) {
      console.error('Error executing create task action:', error);
      return false;
    }
  }

  // Ejecutar acción de envío de email
  private async executeSendEmailAction(ticketData: TicketData, parameters: any): Promise<boolean> {
    try {
      const emailData = {
        to: parameters.to || ticketData.clientId,
        subject: parameters.subject || `Ticket ${ticketData.id} - Actualización`,
        template: parameters.template || 'escalation_notification',
        data: {
          ticketId: ticketData.id,
          subject: ticketData.subject,
          priority: ticketData.priority,
          escalationReason: parameters.reason || 'Escalación automática'
        }
      };

      // Aquí se enviaría el email usando el servicio de email
      console.log('Sending escalation email:', emailData);
      return true;
    } catch (error) {
      console.error('Error executing send email action:', error);
      return false;
    }
  }

  // Enviar notificaciones de escalación
  private async sendEscalationNotifications(ticketData: TicketData, rule: EscalationRule): Promise<void> {
    try {
      // Notificar al agente original
      await notificationService.sendNotification({
        type: 'warning',
        title: 'Ticket Escalado',
        message: `El ticket ${ticketData.id} ha sido escalado: ${rule.name}`,
        recipients: [ticketData.assignedTo],
        metadata: {
          ticketId: ticketData.id,
          escalationRule: rule.id
        }
      });

      // Notificar a supervisores si está configurado
      if (rule.targetUsers && rule.targetUsers.length > 0) {
        await notificationService.sendNotification({
          type: 'info',
          title: 'Nuevo Ticket Escalado',
          message: `Ticket ${ticketData.id} requiere atención: ${rule.name}`,
          recipients: rule.targetUsers,
          metadata: {
            ticketId: ticketData.id,
            escalationRule: rule.id
          }
        });
      }
    } catch (error) {
      console.error('Error sending escalation notifications:', error);
    }
  }

  // Evaluar condición de escalación
  private evaluateCondition(data: any, condition: EscalationCondition): boolean {
    const value = data[condition.field];
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      default:
        return false;
    }
  }

  // Obtener escalación activa
  private async getActiveEscalation(ticketId: string): Promise<TicketEscalation | null> {
    try {
      const escalationQuery = query(
        collection(firestore, 'ticketEscalations'),
        where('ticketId', '==', ticketId),
        where('status', '==', 'active')
      );
      const escalationSnapshot = await getDocs(escalationQuery);
      
      if (!escalationSnapshot.empty) {
        const doc = escalationSnapshot.docs[0];
        return { id: doc.id, ...doc.data() } as TicketEscalation;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting active escalation:', error);
      return null;
    }
  }

  // Resolver escalación
  public async resolveEscalation(escalationId: string, resolution: string): Promise<void> {
    try {
      await updateDoc(doc(firestore, 'ticketEscalations', escalationId), {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        notes: resolution
      });
    } catch (error) {
      console.error('Error resolving escalation:', error);
    }
  }

  // Cancelar escalación
  public async cancelEscalation(escalationId: string, reason: string): Promise<void> {
    try {
      await updateDoc(doc(firestore, 'ticketEscalations', escalationId), {
        status: 'cancelled',
        resolvedAt: new Date().toISOString(),
        notes: reason
      });
    } catch (error) {
      console.error('Error cancelling escalation:', error);
    }
  }

  // Obtener estadísticas de escalación
  public async getEscalationStats(): Promise<any> {
    try {
      const escalationsQuery = query(collection(firestore, 'ticketEscalations'));
      const escalationsSnapshot = await getDocs(escalationsQuery);
      const escalations = escalationsSnapshot.docs.map(doc => doc.data());

      const stats = {
        totalEscalations: escalations.length,
        activeEscalations: escalations.filter(e => e.status === 'active').length,
        resolvedEscalations: escalations.filter(e => e.status === 'resolved').length,
        byType: {} as Record<string, number>,
        byReason: {} as Record<string, number>,
        averageResolutionTime: 0
      };

      escalations.forEach(escalation => {
        stats.byType[escalation.escalationType] = (stats.byType[escalation.escalationType] || 0) + 1;
        stats.byReason[escalation.reason] = (stats.byReason[escalation.reason] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting escalation stats:', error);
      return null;
    }
  }
}

// Singleton instance
export const ticketEscalationService = new TicketEscalationService();

export default ticketEscalationService; 