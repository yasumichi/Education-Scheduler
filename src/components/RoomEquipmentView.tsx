import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels } from '../types';
import './RoomEquipmentView.css';

interface Props {
  room: Resource;
  onClose: () => void;
  labels: ResourceLabels;
}

export function RoomEquipmentView({ room, onClose, labels }: Props) {
  const { t } = useTranslation();

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>{room.name}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="room-info">
          <span className="info-label">{t('Capacity')}: </span>
          <span className="info-value">{room.capacity || '-'}</span>
        </div>

        <div className="room-equipment-content">
          <table className="room-equipment-table">
            <thead>
              <tr>
                <th>{t('{{resource}} Name', { resource: labels.equipment })}</th>
                <th style={{ width: '80px' }}>{t('Quantity')}</th>
              </tr>
            </thead>
            <tbody>
              {room.equipments?.map((re, idx) => (
                <tr key={idx}>
                  <td>{re.equipment?.name || t('Unknown')}</td>
                  <td className="quantity-cell">{re.quantity}</td>
                </tr>
              ))}
              {(!room.equipments || room.equipments.length === 0) && (
                <tr>
                  <td colSpan={2} className="empty-cell">
                    {t('No {{resource}} defined.', { resource: labels.equipment })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="dialog-footer">
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
