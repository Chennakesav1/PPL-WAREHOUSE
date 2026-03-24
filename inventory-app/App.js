import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';

// UPDATE TO YOUR RENDER URL OR LAPTOP IP
const API_URL = "https://ppl-warehouse-1qn1.onrender.com/api";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  
  // Authentication & Splash States
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null); // Replaces isAuthenticated. Stores { username, role }
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // App States (Scanning & Products)
  const [scanned, setScanned] = useState(false);
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [manualCode, setManualCode] = useState('');

  // Extra States for Production Department
  const [rawMaterialCode, setRawMaterialCode] = useState('');
  const [rawMaterialKg, setRawMaterialKg] = useState('');

  // 1. Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => { setShowSplash(false); }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // 2. Role-Based Login
  const handleLogin = async () => {
    if (!usernameInput || !passwordInput) return Alert.alert("Error", "Please enter credentials");
    try {
      const res = await axios.post(`${API_URL}/login`, {
        username: usernameInput.toLowerCase().trim(),
        password: passwordInput.trim()
      });
      if (res.data.success) {
        setUser({ username: res.data.username, role: res.data.role });
        setPasswordInput(''); // Clear password for security
      }
    } catch (err) {
      Alert.alert("Access Denied ❌", "Incorrect username or password.");
    }
  };

  // 3. Search / Scan Product
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

  // 4. ADMIN & PURCHASE: Standard Stock Update (Inward / Dispatch)
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

  // 5. PRODUCTION: Record a batch and consume raw steel
  const handleProduction = async () => {
    if (!quantity || !rawMaterialCode || !rawMaterialKg) return Alert.alert("Error", "Fill all production fields");
    try {
      await axios.post(`${API_URL}/production/batch`, {
        productBarcode: product.barcode || product.productCode,
        quantityProduced: parseInt(quantity),
        rawMaterialCode: rawMaterialCode.trim(),
        rawMaterialConsumedKg: parseFloat(rawMaterialKg),
        username: user.username
      });
      Alert.alert("Success! 🏭", "Batch produced & Steel consumed!", [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) {
      Alert.alert("Failed", err.response?.data?.message || "Production Error");
    }
  };

  // 6. SALES: Dispatch an order
  const handleSales = async () => {
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) return Alert.alert("Error", "Enter a valid quantity");
    try {
      await axios.post(`${API_URL}/sales/order`, {
        productBarcode: product.barcode || product.productCode,
        quantitySold: parseInt(quantity),
        customerName: "Walk-in Customer / App Order",
        username: user.username
      });
      Alert.alert("Success! 📦", "Order Dispatched!", [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) {
      Alert.alert("Failed", err.response?.data?.message || "Sales Error");
    }
  };

  // Reset Scanner
  const resetApp = () => { 
    setScanned(false); setProduct(null); setQuantity('1'); 
    setRawMaterialCode(''); setRawMaterialKg(''); 
  };

  const handleLogout = () => { setUser(null); setUsernameInput(''); };

  // --- UI RENDER BLOCKS ---

  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{marginBottom: 20}}>Camera permission required.</Text>
        <TouchableOpacity style={styles.btnGreen} onPress={requestPermission}><Text style={styles.btnText}>Enable Camera</Text></TouchableOpacity>
      </View>
    );
  }

  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashLogo}>PPL</Text>
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20, transform: [{ scale: 1.5 }] }} />
        <Text style={styles.splashText}>LOADING ERP SYSTEM...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>PPL ERP App</Text>
          <Text style={styles.loginSubtitle}>Authorized Personnel Only</Text>
          <TextInput style={styles.loginInput} placeholder="Username" value={usernameInput} onChangeText={setUsernameInput} autoCapitalize="none" />
          <TextInput style={styles.loginInput} placeholder="Password" value={passwordInput} onChangeText={setPasswordInput} secureTextEntry={true} />
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}><Text style={styles.btnText}>Login Securely</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

              {/* DYNAMIC ROLE-BASED CONTROLS */}
              
              {/* 1. PRODUCTION ROLE */}
              {user.role === 'PRODUCTION' && (
                <View style={styles.roleBox}>
                  <Text style={styles.roleBoxTitle}>🏭 Raw Material Consumed</Text>
                  <TextInput style={styles.inputSmall} placeholder="Steel Code (e.g., STL-10MM)" value={rawMaterialCode} onChangeText={setRawMaterialCode} />
                  <TextInput style={styles.inputSmall} placeholder="Weight Used (Kg)" keyboardType="numeric" value={rawMaterialKg} onChangeText={setRawMaterialKg} />
                  <TouchableOpacity style={styles.btnGreen} onPress={handleProduction}><Text style={styles.btnText}>Record Production Batch</Text></TouchableOpacity>
                </View>
              )}

              {/* 2. SALES ROLE */}
              {user.role === 'SALES' && (
                <View style={styles.roleBox}>
                  <Text style={styles.roleBoxTitle}>📦 Order Fulfillment</Text>
                  <TouchableOpacity style={styles.btnBlue} onPress={handleSales}><Text style={styles.btnText}>Dispatch Sales Order</Text></TouchableOpacity>
                </View>
              )}

              {/* 3. ADMIN OR PURCHASE ROLE */}
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