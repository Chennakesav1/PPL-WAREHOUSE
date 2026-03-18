import React, { useState, useEffect } from 'react';
import { 
  Text, View, StyleSheet, TouchableOpacity, Alert, TextInput, 
  ScrollView, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// UPDATE TO YOUR RENDER URL
const API_URL = "https://ppl-warehouse-wkdp.onrender.com/api";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();


  const [prodStage, setProdStage] = useState('FORGING'); // 'FORGING', 'ROLLING', 'SEC_OP'
  const [machineName, setMachineName] = useState('');
  const [rejectedQty, setRejectedQty] = useState('');
  
  // --- 1. SESSION & AUTH STATES ---
  const [isReady, setIsReady] = useState(false); 
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);

  // --- 2. APP FUNCTIONAL STATES ---
  const [scanned, setScanned] = useState(false);
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [manualCode, setManualCode] = useState('');
  const [rawMaterialCode, setRawMaterialCode] = useState('');
  const [rawMaterialKg, setRawMaterialKg] = useState('');

  // --- 3. IMPROVED INITIALIZATION (STAY LOGGED IN) ---
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const savedUser = await AsyncStorage.getItem('workerUser');
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          setUser(userData);
          console.log("✅ Session Restored:", userData.username);
        }
      } catch (e) {
        console.error("❌ Storage Error:", e);
      } finally {
        // 🛠️ Wait for splash effect for 2 seconds then show app
        setTimeout(() => setIsReady(true), 2000); 
      }
    };
    restoreSession();
  }, []);

  // --- 4. LOGIN LOGIC ---
  const handleLogin = async () => {
    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    if (!cleanUser || !cleanPass) return Alert.alert("Error", "Enter credentials");
    
    setLoading(true);
    try {
      await AsyncStorage.clear(); // Wipe old ghosts

      const res = await fetch(`${API_URL}/app-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass })
      });
      const data = await res.json();
      
      if (data.success) {
        await AsyncStorage.setItem('workerUser', JSON.stringify(data));
        setUser(data);
        setUsernameInput('');
        setPasswordInput('');
      } else {
        Alert.alert("Login Failed", "Invalid Worker Credentials");
      }
    } catch (e) {
      Alert.alert("Connection Error", "Server is not responding.");
    } finally {
      setLoading(false);
    }
  };

  // --- 5. LOGOUT LOGIC ---
  const handleLogout = async () => {
    try {
      setLoading(true);
      await AsyncStorage.clear();
      setUser(null);
      resetApp();
      Alert.alert("Logged Out", "Session cleared successfully.");
    } catch (e) {
      console.error("Logout Error:", e);
    } finally {
      setLoading(false);
    }
  };

  // --- 6. PRODUCT SEARCH / SCAN ---
  const handleSearch = async (searchCode) => {
    if (!searchCode) return Alert.alert("Error", "Please enter a code");
    setScanned(true); 
    try {
      const res = await axios.get(`${API_URL}/product/${searchCode.trim()}`);
      setProduct(res.data);
      setManualCode(''); 
    } catch (err) {
      Alert.alert("Not Found", `Code ${searchCode} is not in the system.`, [{ text: "OK", onPress: () => setScanned(false) }]);
    }
  };

  // --- 7. STOCK UPDATES (ADMIN/PURCHASE) ---
  const handleStandardUpdate = async (type) => {
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) return Alert.alert("Error", "Enter a valid quantity");
    try {
      const res = await axios.post(`${API_URL}/stock`, {
        barcode: product.barcode || product.productCode, 
        type: type, 
        quantity: parseInt(quantity),
        username: user.username 
      });
      Alert.alert("Success! ✅", `${type} recorded.\nNew Stock: ${res.data.newStock}`, [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) { Alert.alert("Failed", "Server Error."); }
  };

// --- 8. MULTI-STAGE PRODUCTION LOGIC ---
  const handleProduction = async () => {
    if (!quantity) return Alert.alert("Error", "Enter accepted quantity");
    if (prodStage === 'FORGING' && (!rawMaterialCode || !rawMaterialKg)) {
        return Alert.alert("Error", "Forging requires Raw Material details");
    }

    try {
      await axios.post(`${API_URL}/production/batch`, {
        productBarcode: product.barcode || product.productCode,
        stage: prodStage,
        machineName: machineName.trim(),
        acceptedQty: parseInt(quantity),
        rejectedQty: parseInt(rejectedQty) || 0,
        rawMaterialCode: rawMaterialCode.trim(),
        rawMaterialConsumedKg: parseFloat(rawMaterialKg) || 0,
        username: user.username
      });
      Alert.alert("Success! 🏭", `${prodStage} recorded successfully!`, [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) {
      Alert.alert("Failed", err.response?.data?.message || "Production Error");
    }
  };

  // --- 9. SALES LOGIC ---
  const handleSales = async () => {
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) return Alert.alert("Error", "Enter a valid quantity");
    try {
      await axios.post(`${API_URL}/sales/order`, {
        productBarcode: product.barcode || product.productCode,
        quantitySold: parseInt(quantity),
        username: user.username
      });
      Alert.alert("Success! 📦", "Order Dispatched!", [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) {
      Alert.alert("Failed", err.response?.data?.message || "Sales Error");
    }
  };

  const resetApp = () => { 
    setScanned(false); setProduct(null); setQuantity('1'); 
    setRawMaterialCode(''); setRawMaterialKg(''); 
  };

  // --- RENDER SPLASH/READY STATE ---
  if (!isReady) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashLogo}>PPL</Text>
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />
        <Text style={styles.splashText}>RESUMING SESSION...</Text>
      </View>
    );
  }

  // --- RENDER PERMISSION SCREEN ---
  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{marginBottom: 20}}>Camera permission required to scan.</Text>
        <TouchableOpacity style={styles.btnBlue} onPress={requestPermission}><Text style={styles.btnText}>Enable Camera</Text></TouchableOpacity>
      </View>
    );
  }

  // --- RENDER LOGIN SCREEN ---
  if (!user) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>PPL ERP App</Text>
          <Text style={styles.loginSubtitle}>Authorized Personnel Only</Text>
          <TextInput style={styles.loginInput} placeholder="Username" value={usernameInput} onChangeText={setUsernameInput} autoCapitalize="none" />
          <TextInput style={styles.loginInput} placeholder="Password" value={passwordInput} onChangeText={setPasswordInput} secureTextEntry={true} />
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Login Securely</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- RENDER MAIN APP ---
  return (
    <SafeAreaView style={styles.container}>
      {!scanned ? (
        <View style={{flex: 1}}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerText}>{user.role} Tools</Text>
              <Text style={{color: '#e0e0e0', fontSize: 12}}>User: {user.username}</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={{color: 'white', fontWeight: 'bold'}}>Logout</Text></TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} placeholder="Type code..." value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" />
            <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch(manualCode)}><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
          </View>

          <View style={styles.cameraContainer}>
             <CameraView style={StyleSheet.absoluteFillObject} onBarcodeScanned={({data}) => handleSearch(data)} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.detailsBox}>
          {product && (
            <View style={{width: '100%'}}>
              <Text style={styles.itemTitle}>{String(product.productCode || 'N/A')}</Text>
              <View style={styles.card}>
                <View style={styles.infoRow}><Text style={styles.label}>Sector:</Text><Text style={styles.val}>{String(product.sector || '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Type:</Text><Text style={styles.val}>{String(product.type || '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Grade:</Text><Text style={styles.val}>{String(product.grade || '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>A/F:</Text><Text style={styles.val}>{String(product.af !== undefined && product.af !== null ? product.af : '-')}</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Length:</Text><Text style={styles.val}>{String(product.length || 0)} mm</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Wt/Pc:</Text><Text style={styles.val}>{String(product.weightPerPc || 0)} g</Text></View>
                <View style={styles.infoRow}><Text style={styles.label}>Stock:</Text><Text style={[styles.val, {color: '#007bff', fontSize: 18}]}>{String(product.currentStock || 0)}</Text></View>
              </View>

              <Text style={styles.qtyLabel}>Quantity (Bolts):</Text>
              <TextInput style={styles.inputBig} keyboardType="numeric" value={quantity} onChangeText={setQuantity} autoFocus={true} />

              {/* 1. UPGRADED PRODUCTION ROLE (Multi-Stage) */}
              {user.role === 'PRODUCTION' && (
                <View style={styles.roleBox}>
                  <Text style={styles.roleBoxTitle}>🏭 Production Stage</Text>
                  
                  {/* Stage Selector Toggle */}
                  <View style={{flexDirection: 'row', marginBottom: 15, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd'}}>
                    <TouchableOpacity style={[styles.toggleBtn, prodStage === 'FORGING' && {backgroundColor: '#007bff'}]} onPress={() => setProdStage('FORGING')}>
                      <Text style={{color: prodStage === 'FORGING' ? 'white' : '#666', fontWeight: 'bold'}}>FORGING</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, prodStage === 'ROLLING' && {backgroundColor: '#007bff'}]} onPress={() => setProdStage('ROLLING')}>
                      <Text style={{color: prodStage === 'ROLLING' ? 'white' : '#666', fontWeight: 'bold'}}>ROLLING</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, prodStage === 'SEC_OP' && {backgroundColor: '#007bff'}]} onPress={() => setProdStage('SEC_OP')}>
                      <Text style={{color: prodStage === 'SEC_OP' ? 'white' : '#666', fontWeight: 'bold'}}>SEC. OP</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput style={styles.inputSmall} placeholder="Machine (e.g., CH5, TK250)" value={machineName} onChangeText={setMachineName} autoCapitalize="characters" />
                  <TextInput style={styles.inputSmall} placeholder="Rejected Qty (PCS)" keyboardType="numeric" value={rejectedQty} onChangeText={setRejectedQty} />
                  
                  {/* Only ask for Raw Steel during Forging */}
                  {prodStage === 'FORGING' && (
                    <View style={{backgroundColor: '#eef2f5', padding: 10, borderRadius: 8, marginBottom: 10}}>
                        <Text style={{fontSize: 12, fontWeight: 'bold', marginBottom: 5, color: '#555'}}>RAW MATERIAL CONSUMED</Text>
                        <TextInput style={[styles.inputSmall, {backgroundColor: 'white'}]} placeholder="Steel Code (e.g., STL-10MM)" value={rawMaterialCode} onChangeText={setRawMaterialCode} />
                        <TextInput style={[styles.inputSmall, {backgroundColor: 'white', marginBottom: 0}]} placeholder="Weight Used (Kg)" keyboardType="numeric" value={rawMaterialKg} onChangeText={setRawMaterialKg} />
                    </View>
                  )}

                  <TouchableOpacity style={styles.btnBlue} onPress={handleProduction}>
                      <Text style={styles.btnText}>Record {prodStage}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {user.role === 'SALES' && (
                <View style={styles.roleBox}>
                  <Text style={styles.roleBoxTitle}>📦 Order Fulfillment</Text>
                  <TouchableOpacity style={styles.btnBlue} onPress={handleSales}><Text style={styles.btnText}>Dispatch Sales Order</Text></TouchableOpacity>
                </View>
              )}

              {(user.role === 'ADMIN' || user.role === 'PURCHASE') && (
                <View style={styles.roleBox}>
                  <Text style={styles.roleBoxTitle}>⚙️ Manual Stock Adjustment</Text>
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.btnGreen} onPress={() => handleStandardUpdate('INWARD')}><Text style={styles.btnText}>+ INWARD</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.btnRed} onPress={() => handleStandardUpdate('DISPATCH')}><Text style={styles.btnText}>- DISPATCH</Text></TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity style={styles.cancelBtn} onPress={resetApp}><Text style={styles.cancelText}>Cancel & Rescan</Text></TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  splashContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  splashLogo: { fontSize: 80, fontWeight: '900', color: '#007bff', letterSpacing: 5 },
  splashText: { marginTop: 40, color: '#666', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  loginContainer: { flex: 1, backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center' },
  loginCard: { backgroundColor: 'white', padding: 30, borderRadius: 15, width: '85%', alignItems: 'center', elevation: 5 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#007bff', marginBottom: 5 },
  loginSubtitle: { fontSize: 14, color: '#666', marginBottom: 25 },
  loginInput: { width: '100%', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  loginBtn: { backgroundColor: '#007bff', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  header: { padding: 30, paddingTop: 50, backgroundColor: '#007bff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 5 },
  searchContainer: { flexDirection: 'row', padding: 15, backgroundColor: 'white', elevation: 2, zIndex: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9' },
  searchBtn: { backgroundColor: '#333', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8, marginLeft: 10 },
  searchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cameraContainer: { flex: 1, margin: 20, borderRadius: 20, overflow: 'hidden', backgroundColor: 'black' },
  detailsBox: { padding: 20, alignItems: 'center' },
  itemTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  card: { backgroundColor: 'white', width: '100%', padding: 15, borderRadius: 10, elevation: 3, marginBottom: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8 },
  label: { color: '#666', fontWeight: 'bold' },
  val: { fontWeight: 'bold', color: '#333' },
  qtyLabel: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  inputBig: { borderBottomWidth: 3, borderColor: '#007bff', width: 120, fontSize: 36, textAlign: 'center', marginBottom: 20, alignSelf: 'center' },
  roleBox: { backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', width: '100%', marginBottom: 15 },
  roleBoxTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginBottom: 15, textAlign: 'center' },
  inputSmall: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 16, backgroundColor: '#f9f9f9' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnGreen: { flex: 1, backgroundColor: '#28a745', padding: 18, borderRadius: 10, alignItems: 'center', marginHorizontal: 2 },
  btnRed: { flex: 1, backgroundColor: '#dc3545', padding: 18, borderRadius: 10, alignItems: 'center', marginHorizontal: 2 },
  btnBlue: { width: '100%', backgroundColor: '#007bff', padding: 18, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { marginTop: 20, alignSelf: 'center' },
  cancelText: { color: '#666', fontSize: 16, fontWeight: 'bold' }
});