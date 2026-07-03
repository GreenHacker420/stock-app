import { SuccessModal } from "../ui/SuccessModal";

type SuccessFeedbackProps = {
  visible: boolean;
  title: string;
  message?: string;
  onClose: () => void;
};

export function SuccessFeedback({ visible, title, message, onClose }: SuccessFeedbackProps) {
  return <SuccessModal visible={visible} title={title} message={message ?? ""} onClose={onClose} />;
}
