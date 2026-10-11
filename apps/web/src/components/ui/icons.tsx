import { type SVGProps, type FC } from 'react';

import ActorsIcon from '@/assets/icons/Actors.svg?react';
import AlertsIcon from '@/assets/icons/Alerts.svg?react';
import AnalyticsIcon from '@/assets/icons/Analytics.svg?react';
import AuditLogIcon from '@/assets/icons/Audit Log.svg?react';
import CaretDownIcon from '@/assets/icons/Caret - Down.svg?react';
import CaretLeftIcon from '@/assets/icons/Caret - Left.svg?react';
import CompanyIcon from '@/assets/icons/Company.svg?react';
import DashboardIcon from '@/assets/icons/Dashboard.svg?react';
import DevicesIcon from '@/assets/icons/Devices.svg?react';
import DriverIcon from '@/assets/icons/Driver.svg?react';
import EvChargingIcon from '@/assets/icons/EV Charging.svg?react';
import ExcutiveIcon from '@/assets/icons/Excutive.svg?react';
import GroupsIcon from '@/assets/icons/Groups.svg?react';
import IncedentsIcon from '@/assets/icons/Incedents.svg?react';
import IssuesIcon from '@/assets/icons/Issues.svg?react';
import LiveTrackingIcon from '@/assets/icons/Live Tracking.svg?react';
import MaintenanceIcon from '@/assets/icons/Maintenance.svg?react';
import OrganizationSettingIcon from '@/assets/icons/Organization Setting.svg?react';
import OverviewIcon from '@/assets/icons/Overview.svg?react';
import RefuelIcon from '@/assets/icons/Refuel.svg?react';
import RemindersIcon from '@/assets/icons/Reminders.svg?react';
import ReportsIcon from '@/assets/icons/Reports.svg?react';
import RoleIcon from '@/assets/icons/Role.svg?react';
import ServiceTaskIcon from '@/assets/icons/Service Task.svg?react';
import ServiceIcon from '@/assets/icons/Service.svg?react';
import SettingIcon from '@/assets/icons/Setting.svg?react';
import TripIcon from '@/assets/icons/Trip.svg?react';
import UserManagementIcon from '@/assets/icons/User Management.svg?react';
import VehicleAssignmentIcon from '@/assets/icons/Vehicle Assignment.svg?react';
import VehicleListIcon from '@/assets/icons/Vehicle list.svg?react';
import VehicleIcon from '@/assets/icons/Vehicle.svg?react';
import VendorIcon from '@/assets/icons/Vendor.svg?react';
import WorkOrderIcon from '@/assets/icons/Work Order.svg?react';

export const Icons = {
  Actors: ActorsIcon as FC<SVGProps<SVGSVGElement>>,
  Alerts: AlertsIcon as FC<SVGProps<SVGSVGElement>>,
  Analytics: AnalyticsIcon as FC<SVGProps<SVGSVGElement>>,
  AuditLog: AuditLogIcon as FC<SVGProps<SVGSVGElement>>,
  CaretDown: CaretDownIcon as FC<SVGProps<SVGSVGElement>>,
  CaretLeft: CaretLeftIcon as FC<SVGProps<SVGSVGElement>>,
  Company: CompanyIcon as FC<SVGProps<SVGSVGElement>>,
  Dashboard: DashboardIcon as FC<SVGProps<SVGSVGElement>>,
  Devices: DevicesIcon as FC<SVGProps<SVGSVGElement>>,
  Driver: DriverIcon as FC<SVGProps<SVGSVGElement>>,
  EvCharging: EvChargingIcon as FC<SVGProps<SVGSVGElement>>,
  Excutive: ExcutiveIcon as FC<SVGProps<SVGSVGElement>>,
  Groups: GroupsIcon as FC<SVGProps<SVGSVGElement>>,
  Incedents: IncedentsIcon as FC<SVGProps<SVGSVGElement>>,
  Issues: IssuesIcon as FC<SVGProps<SVGSVGElement>>,
  LiveTracking: LiveTrackingIcon as FC<SVGProps<SVGSVGElement>>,
  Maintenance: MaintenanceIcon as FC<SVGProps<SVGSVGElement>>,
  OrganizationSetting: OrganizationSettingIcon as FC<SVGProps<SVGSVGElement>>,
  Overview: OverviewIcon as FC<SVGProps<SVGSVGElement>>,
  Refuel: RefuelIcon as FC<SVGProps<SVGSVGElement>>,
  Reminders: RemindersIcon as FC<SVGProps<SVGSVGElement>>,
  Reports: ReportsIcon as FC<SVGProps<SVGSVGElement>>,
  Role: RoleIcon as FC<SVGProps<SVGSVGElement>>,
  ServiceTask: ServiceTaskIcon as FC<SVGProps<SVGSVGElement>>,
  Service: ServiceIcon as FC<SVGProps<SVGSVGElement>>,
  Setting: SettingIcon as FC<SVGProps<SVGSVGElement>>,
  Trip: TripIcon as FC<SVGProps<SVGSVGElement>>,
  UserManagement: UserManagementIcon as FC<SVGProps<SVGSVGElement>>,
  VehicleAssignment: VehicleAssignmentIcon as FC<SVGProps<SVGSVGElement>>,
  VehicleList: VehicleListIcon as FC<SVGProps<SVGSVGElement>>,
  Vehicle: VehicleIcon as FC<SVGProps<SVGSVGElement>>,
  Vendor: VendorIcon as FC<SVGProps<SVGSVGElement>>,
  WorkOrder: WorkOrderIcon as FC<SVGProps<SVGSVGElement>>,
} as const;

export type IconName = keyof typeof Icons;

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export const Icon = ({ name, ...props }: IconProps) => {
  const IconComponent = Icons[name];
  return <IconComponent {...props} />;
};
