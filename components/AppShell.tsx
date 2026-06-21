import Sidebar from './Sidebar';
import styles from './AppShell.module.css';

interface Props {
  active: 'funds' | 'expenses';
  displayName: string;
  children: React.ReactNode;
}

export default function AppShell({ active, displayName, children }: Props) {
  return (
    <div className={styles.shell}>
      <Sidebar active={active} displayName={displayName} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
