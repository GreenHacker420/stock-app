import { useEffect, useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text, Icon, TextInput, Portal, Dialog, Divider } from "react-native-paper";
import { fetchPayments, verifyPayment, markPaymentMismatch, fetchShops, Payment } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function PaymentVerification() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [shopId, setShopId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedMode, setSelectedMode] = useState("ALL");
  const [note, setNote] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"verify" | "mismatch" | null>(null);

  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) setShopId(shopsQuery.data[0].id);
  }, [shopId, shopsQuery.data]);

  const paymentsQuery = useQuery({
    queryKey: ["payments", shopId],
    queryFn: () => fetchPayments(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!activePaymentId || !actionType) return Promise.reject();
      return actionType === "verify" 
        ? verifyPayment(token ?? "", activePaymentId, note)
        : markPaymentMismatch(token ?? "", activePaymentId, note);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", shopId] });
      setActivePaymentId(null);
      setActionType(null);
      setNote("");
    },
  });

  const filteredPayments = useMemo(() => {
    return (paymentsQuery.data ?? []).filter(p => {
      if (p.paymentMode === "CASH") return false;
      const matchesTab = activeTab === "pending" 
        ? (p.verificationStatus === "RECORDED" || p.verificationStatus === "PENDING_VERIFICATION")
        : (p.verificationStatus === "VERIFIED" || p.verificationStatus === "MISMATCH");
      const matchesMode = selectedMode === "ALL" || p.paymentMode === selectedMode;
      return matchesTab && matchesMode;
    });
  }, [paymentsQuery.data, activeTab, selectedMode]);

  const pendingCount = (paymentsQuery.data ?? []).filter(p => 
    p.paymentMode !== "CASH" && (p.verificationStatus === "RECORDED" || p.verificationStatus === "PENDING_VERIFICATION")
  ).length;

  return (
    <Screen scroll={false}>
      <AppHeader title="Payment Verification" subtitle={`${pendingCount} entries pending review`} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="bg-white border-b border-gray-100 px-4 py-3 max-h-16">
        {["ALL", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"].map(mode => (
          <Pressable 
            key={mode} 
            onPress={() => setSelectedMode(mode)}
            className={`mr-2 px-4 py-1.5 rounded-full border ${selectedMode === mode ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
          >
            <Text style={{ fontWeight: "700", color: selectedMode === mode ? 'white' : '#4b5563', fontSize: 12 }}>
              {mode.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View className="px-4 py-2 bg-gray-50 flex-row gap-4">
        <Pressable onPress={() => setActiveTab("pending")} className="pb-2 flex-1 items-center border-b-2" style={{ borderBottomColor: activeTab === "pending" ? "#1e40af" : "transparent" }}>
          <Text style={{ fontWeight: "700", color: activeTab === "pending" ? "#1e40af" : "#9ca3af" }}>Pending</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("history")} className="pb-2 flex-1 items-center border-b-2" style={{ borderBottomColor: activeTab === "history" ? "#1e40af" : "transparent" }}>
          <Text style={{ fontWeight: "700", color: activeTab === "history" ? "#1e40af" : "#9ca3af" }}>History</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 p-4 bg-gray-50" showsVerticalScrollIndicator={false}>
        <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />
        
        <View className="gap-3 pb-8">
          {filteredPayments.map(payment => (
            <PaymentCard 
              key={payment.id} 
              payment={payment} 
              onVerify={() => { setActivePaymentId(payment.id); setActionType("verify"); }}
              onMismatch={() => { setActivePaymentId(payment.id); setActionType("mismatch"); }}
            />
          ))}
          
          {filteredPayments.length === 0 && !paymentsQuery.isLoading && (
            <View className="p-12 items-center opacity-40">
              <Icon source="check-circle-outline" size={64} color="#9ca3af" />
              <Text className="mt-4" variant="titleMedium">No transactions found</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={activePaymentId !== null} onDismiss={() => setActivePaymentId(null)} style={{ backgroundColor: "white", borderRadius: 12 }}>
          <Dialog.Title style={{ fontWeight: "800" }}>{actionType === "verify" ? "Confirm Verification" : "Flag Mismatch"}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Add a note (optional)"
              value={note}
              onChangeText={setNote}
              style={{ backgroundColor: "white" }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setActivePaymentId(null)}>Cancel</Button>
            <Button 
              loading={mutation.isPending} 
              onPress={() => mutation.mutate()}
              textColor={actionType === "verify" ? "#1e40af" : "#ef4444"}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function PaymentCard({ payment, onVerify, onMismatch }: { 
  payment: Payment; 
  onVerify: () => void; 
  onMismatch: () => void;
}) {
  const isPending = payment.verificationStatus === "RECORDED" || payment.verificationStatus === "PENDING_VERIFICATION";

  return (
    <View className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      <View className="p-4">
        <View className="flex-row justify-between items-start mb-3">
          <View>
            <Text style={{ fontWeight: "800", color: "#111827", fontSize: 18 }}>₹{payment.amount}</Text>
            <View className="flex-row items-center gap-1 mt-1">
              <Icon source={payment.paymentMode === "UPI" ? "qrcode-scan" : "credit-card-outline"} size={14} color="#6b7280" />
              <Text variant="labelSmall" style={{ color: "#6b7280", fontWeight: "700" }}>{payment.paymentMode}</Text>
            </View>
          </View>
          <StatusPill label={payment.verificationStatus} tone={payment.verificationStatus === "VERIFIED" ? "green" : "amber"} />
        </View>

        <View className="gap-1 mb-4">
          <DetailRow label="Customer" value={payment.customer?.name ?? "Counter Sale"} />
          <DetailRow label="Staff" value={payment.receivedBy.name} />
          {payment.referenceNumber && <DetailRow label="Ref/UTR" value={payment.referenceNumber} />}
          <DetailRow label="Date" value={new Date(payment.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
        </View>

        {isPending && (
          <View className="flex-row gap-3 pt-3 border-t border-gray-50">
            <Button mode="outlined" onPress={onMismatch} className="flex-1" textColor="#ef4444" style={{ borderColor: "#fee2e2" }}>
              Mismatch
            </Button>
            <Button mode="contained" onPress={onVerify} className="flex-1" style={{ backgroundColor: "#1e40af" }}>
              Verify
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string, value: string }) {
  return (
    <View className="flex-row justify-between items-center">
      <Text variant="bodySmall" style={{ color: "#9ca3af" }}>{label}</Text>
      <Text variant="bodySmall" style={{ color: "#111827", fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
